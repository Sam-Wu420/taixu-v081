// 贴身斗法的画面（world/brawl.ts 的特效）：拳风、气浪、轰飞的冲击扭曲与长尾迹、砸地的坑和裂纹、缩地的墨影、脱困的震波、
// 欺身的光带、被击飞者的残影，以及后期的速度线（借遁空那道径向拉丝，强度小得多）。
// 用户的话：越炫越好，不用管水墨画风；但人和对手始终要看得清——所以光都很短命、拉丝只在画面四周、残影限六个。
//
// E2（第二轮）用户看了第一轮截图：「整体游戏效果要越炫酷越好，一眼要让玩家想玩」。加强了——
//   每一拳的拳风冲击波和命中爆点、重击的蓄力闪光、轰出时一道贯穿光柱、更长更亮的轰飞尾迹（带环状音爆圈）、
//   缩地落点的地面炸裂、破罡的碎裂；新加拼招的气场（地面凹陷 / 水面压下去外翻的浪）、砸海的冲天水柱、犁水、
//   破水而出、撞碎礁石的碎石、撞上阵地被拦下。光仍然短命、偏小：人和对手一直看得清。
// 第三轮（收官 E3 + 观感再上一个台阶）主线看了实拍：「功能都对，但还不够一眼想玩」——水柱是一摞小水团、犁水只是一串白沫点、
// 轰飞的光柱细。这一轮把几样大件做成「活的场景件」（pieces：每帧按时间重画，不是一次撒完的粒子）：
//   · 真正的大水柱：粗、高、先冲上去再塌下来，顶上散成水冠，落下一圈水幕，水面一圈圈扩散的浪环；
//   · 犁水：连续的 V 形水墙（两侧一路翻起、往外倒）和身后一条留得住的长白浪；
//   · 坠地大坑（meteor）：放射状的裂纹、坑心的暗、裂缝里的热光、飞溅的大石块、尘穹、地面冲击波；
//   · 坠界那一拳（voidpunch）：往下贯穿的光柱、爆闪、两层冲击环；
//   · 流星的火尾（被砸下去的人在半空：白芯、橙焰、烟边、火星）；
//   · 轰飞的尾迹做成粗壮的能量带（外层热浪、中层金带、白芯）；
//   · 拼招：两股不同颜色的气劲（你的金、对方的赤紫）从两边顶住，中间挤出一圈圈冲击环。
// 仍然守着第一轮的教训：加色的光都短命、偏小，水和尘用普通混合（加色在泛光下会糊成一整片白）；场景件最多 10 件。
import type { Combat } from '../world/combat';
import type { Game } from '../world/game';
import type { FxEvent } from './combatgl';
import { FxSys, col, mixc, RGB, FlightPoint, smokeCell, fireCell, extOK } from './fx';
import { C } from './atlas';
import { K } from './fxbake';
import { decal } from './bakefx';
import type { AimView } from '../world/brawl';
import { bladeEvent, drawBlades } from './bladegl';
import { fx3dPeek } from '../world/fx3d';
import { hfSetting } from '../world/hitfeel';   // r9-hitfeel

const TAU = Math.PI * 2;
const WHITE: RGB = [1, 1, 1];
const DUST: RGB = [0.3, 0.25, 0.19];
const SEA: RGB = [0.55, 0.82, 0.98];
const FOAM: RGB = [0.9, 0.97, 1];
const DEEP: RGB = [0.04, 0.12, 0.2];
/** 第三轮的水：浪花（比 FOAM 暗一截，泛光不吃它）、水身（青蓝）、外缘（深青） */
// 收官 B4 / 打磨：水柱压暗一档（原来柱身偏亮，像一根光柱）
const WAVE: RGB = [0.68, 0.78, 0.83], BODY: RGB = [0.33, 0.54, 0.65], WALL: RGB = [0.12, 0.27, 0.36];
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/** 近战的特效事件名（combatgl 按这个转给 brawlEvent） */
export const BRAWL_EVENTS = new Set<string>(['bxhit', 'rush', 'launch', 'slam', 'crater', 'blinkstep', 'tech', 'splash', 'bxguard', 'clash', 'pillar', 'wake', 'breach', 'rubble', 'bxcharge', 'bxblock', 'meteor', 'voidpunch', 'clashring', 'bxwhit', 'bxquake']);

/** 贴地画（不跟立板走）：flat(() => …) 里画的都是平铺在地上的 */
function flat(F: FxSys, fn: () => void) { const prev = F.B.billboard; F.B.billboard = null; fn(); F.B.billboard = prev; }

/**
 * r9-hitfeel：打在人身上的那一闪。打击感开着时不再是一团球形柔光（加色的大光团把被打的人整个盖住、看不见轮廓——实拍看过），
 * 只留一圈往外扩的亮边和一个很小的实芯；关着时照旧 F.flash
 */
function hitFlash(F: FxSys, x: number, y: number, r: number, c: RGB, life: number) {
  if (!hfSetting.on) { F.flash(x, y, r, c, life); return; }
  F.shockRing(x, y, r * 2.6, c, life * 1.6, 0.9, 0.6);
  F.emit({ x, y, life: life * 0.6, s0: r * 0.45, s1: r * 0.6, c: mixc(c, WHITE, 0.5), a: 0.45, cell: C.Core });
}
/** 一个事件（命中、轰飞、砸地……）的爆发；billboard 已按事件的 anchor 设好 */
export function brawlEvent(F: FxSys, ev: FxEvent) {
  const cc = col(ev.color ?? '255,220,160'), core = mixc(cc, WHITE, 0.6), p = ev.power ?? 1;
  const dir = ev.dir === undefined ? undefined : F.B.direction(Math.cos(ev.dir), Math.sin(ev.dir));
  switch (ev.k) {
    case 'bxhit': {
      // 拳风：命中处一记爆点（星芒 + 白芯）、顺着拳路喷出的火花和气流细丝、一圈竖着的拳风冲击波；
      // 越往后的连段越重（r = 第几连），重的再扭一下空间、再炸一圈地面气浪
      if (hfSetting.on) { F.emit({ x: ev.x, y: ev.y, life: 0.06, s0: 8 + p * 3, s1: 12 + p * 4, c: core, a: 0.45, cell: C.Core }); }   // r9-hitfeel：星和方向线由全游戏打击感画，这里的闪光不再把人照成一团白（原来 2.4 强度、两百多半径的点光源）
      else F.flash(ev.x, ev.y, 10 + p * 7, core, 0.09 + p * 0.02);
      if (p < 0.6) { for (let i = 0; i < 6; i++) F.emit({ x: ev.x, y: ev.y, vx: Math.cos(ev.dir ?? 0) * rnd(200, 420) + rnd(-80, 80), vy: Math.sin(ev.dir ?? 0) * rnd(100, 200) + rnd(-50, 50), life: 0.16, s0: 3, s1: 1, c: WHITE, a: 0.45, stretch: 0.04, cell: C.Glow }); F.shockRing(ev.x, ev.y, 34, [0.85, 0.85, 0.85], 0.18, 0.9, 0.35); break; }
      const n = Math.min(12, ev.r ?? 0), boost = 1 + n * 0.05;
      F.sparks(ev.x, ev.y, core, Math.round(8 + p * 6), (460 + p * 180) * boost, 0.3, 2.8 + p * 0.7, dir, dir === undefined ? TAU : 0.9);
      if (dir !== undefined) for (let i = 0; i < 8 + p * 5; i++) { const a = dir + rnd(-0.32, 0.32), v = rnd(1000, 1700) * (0.7 + p * 0.15); F.emit({ x: ev.x, y: ev.y + rnd(-10, 10), vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.7, life: rnd(0.1, 0.2), s0: rnd(2.5, 4.5), s1: 1, c: i % 3 ? WHITE : cc, a: 0.85, drag: 6, stretch: 0.035, cell: C.Glow }); }
      // 拳风冲击波：两层竖环（内亮外淡）+ 一道沿拳路的白色弧
      F.shockRing(ev.x, ev.y, (32 + p * 18) * boost, core, 0.18, 0.95, 0.85);
      F.shockRing(ev.x, ev.y, (56 + p * 30) * boost, cc, 0.3, 0.9, 0.4);
      if (dir !== undefined) F.emit({ x: ev.x, y: ev.y, life: 0.14, s0: 30 + p * 10, s1: 70 + p * 30, c: core, a: 0.55, cell: C.Slash, rot: dir + Math.PI / 2 });
      if (extOK() && !hfSetting.on) F.emit({ x: ev.x, y: ev.y, life: 0.12 + p * 0.02, s0: 24 + p * 10, s1: 52 + p * 22, c: core, a: 0.75, cell: C.KBurst1, rot: Math.random() * TAU });   // r9-hitfeel：开着打击感时不画（星和线在那边画；这团爆芒叠在人身上就是一团白）   // r9-hitfeel：开着打击感时压淡（星和线在那边画）
      if (p >= 1.5) { F.shock(ev.x, ev.y, 130 + p * 50, 7 + p * 3, 0.3); if (!hfSetting.on) { F.glint(ev.x, ev.y, 16 + p * 6, core, 0.85, 0.16); F.rays(ev.x, ev.y, 40 + p * 18, cc, 0.4, 0.18); } }
      if (p >= 2.5) {
        if (!hfSetting.on) F.emit({ x: ev.x, y: ev.y, life: 0.16, s0: 40, s1: 96, c: cc, a: 0.55, cell: C.KBurst1, rot: Math.random() * TAU });
        // 重击：脚下一圈贴地气浪
        const gy = ev.anchor ? ev.anchor.y : ev.y + 60, gx = ev.anchor ? ev.anchor.x : ev.x;
        flat(F, () => { F.shockRing(gx, gy, 140, cc, 0.35, 0.55, 0.55, true); F.smokeRing(gx, gy, 120, DUST, 0.3, 0.7); });
      }
      break;
    }
    case 'launch': {
      // 轰飞：爆闪、两层气浪环、强扭曲、放射金芒、顺着出拳方向喷出的一锥气流；
      // r = 1（重击轰出 / 往下砸）：再加一道顺着方向贯穿出去的光柱和一圈音爆环
      hitFlash(F, ev.x, ev.y, 16 + p * 6, core, 0.13);
      F.shockRing(ev.x, ev.y, 60 + p * 22, core, 0.24, 0.9, 0.7);
      F.shockRing(ev.x, ev.y, 110 + p * 36, cc, 0.42, 0.85, 0.3);
      F.shock(ev.x, ev.y, 260 + p * 110, 15 + p * 3, 0.45);
      if (!hfSetting.on) { F.rays(ev.x, ev.y, 80 + p * 26, cc, 0.32, 0.24); F.glint(ev.x, ev.y, 20 + p * 7, core, 0.8, 0.2); }
      const a0 = dir ?? -Math.PI / 2;
      for (let i = 0; i < 22 + p * 7; i++) { const a = a0 + rnd(-0.4, 0.4), v = rnd(1400, 2600); F.emit({ x: ev.x, y: ev.y + rnd(-14, 14), vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.75, life: rnd(0.14, 0.28), s0: rnd(3, 5.5), s1: 1, c: i % 3 ? WHITE : core, a: 0.85, drag: 5, stretch: 0.035, cell: C.Glow }); }
      for (let i = 0; i < 6; i++) { const a = a0 + Math.PI + rnd(-0.8, 0.8), v = rnd(200, 420); F.emit({ x: ev.x, y: ev.y + 30, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.5, life: rnd(0.5, 0.8), s0: rnd(24, 34), s1: 70, c: DUST, a: 0.28, add: 0, cell: smokeCell(), drag: 3, rot: Math.random() * TAU }); }
      F.sparks(ev.x, ev.y, core, 20, 950, 0.35, 3.4, a0, 1.1);
      if (ev.r === 1) {
        // 贯穿光柱：从命中点顺着轰出的方向一道长光，外层宽而淡、内层窄而亮，白芯；末端一圈音爆
        const ca = Math.cos(a0), sa = Math.sin(a0) * 0.75, L = 520 + p * 120;
        F.beam(ev.x, ev.y, ev.x + ca * L, ev.y + sa * L, 70, cc, 0.22);
        F.beam(ev.x, ev.y, ev.x + ca * L, ev.y + sa * L, 26, core, 0.55);
        F.beam(ev.x, ev.y, ev.x + ca * L * 0.85, ev.y + sa * L * 0.85, 7, WHITE, 0.9);
        for (let i = 0; i < 3; i++) F.shockRing(ev.x + ca * L * (0.3 + i * 0.25), ev.y + sa * L * (0.3 + i * 0.25), 50 + i * 16, core, 0.22 + i * 0.05, 0.4, 0.6 - i * 0.15);
        if (extOK() && !hfSetting.on) F.emit({ x: ev.x, y: ev.y, life: 0.2, s0: 60, s1: 160, c: cc, a: 0.45, cell: C.KBurst1, rot: a0 });
        F.shock(ev.x, ev.y, 1100, 22, 0.42);   // 第三轮：重击命中的全屏径向扭曲（短促）
      }
      break;
    }
    case 'rush': {
      // 欺身起步：脚下一圈尘浪、身后一道光爆，朝目标先甩出一条细光（光带本身由 drawBrawlGL 每帧拖）
      F.flash(ev.x, ev.y, 16, core, 0.1);
      F.shockRing(ev.x, ev.y + 60, 120, cc, 0.35, 0.55, 0.5, true);
      if (ev.x2 !== undefined && ev.y2 !== undefined) {
        const dx = ev.x2 - ev.x, dy = ev.y2 - ev.y, a = Math.atan2(dy, dx);
        for (let i = 0; i < 16; i++) { const u = Math.random() * 0.4; F.emit({ x: ev.x + dx * u, y: ev.y + dy * u, vx: Math.cos(a) * 1900, vy: Math.sin(a) * 1900 * 0.7, life: rnd(0.08, 0.16), s0: 3, s1: 1, c: WHITE, a: 0.75, stretch: 0.03, cell: C.Glow }); }
        F.emit({ x: ev.x, y: ev.y, life: 0.16, s0: 30, s1: 80, c: core, a: 0.5, cell: C.Slash, rot: a + Math.PI / 2 });
      }
      for (let i = 0; i < 8; i++) { const a = Math.random() * TAU; F.emit({ x: ev.x, y: ev.y + 50, vx: Math.cos(a) * rnd(160, 320), vy: Math.sin(a) * rnd(60, 140), life: rnd(0.4, 0.7), s0: rnd(18, 28), s1: 60, c: DUST, a: 0.26, add: 0, cell: smokeCell(), drag: 3 }); }
      break;
    }
    case 'slam': case 'crater': {
      // 地上的坑：裂纹贴花（留几息）、墨色坑心、贴地气浪、碎石往上崩、尘环；砸地再加一道光柱和强扭曲；
      // 缩地的落点（kind = 'blink'）：一圈紫白的地面炸裂
      const big = ev.k === 'slam', r = ev.r ?? (big ? 220 : 120), rot = Math.random() * TAU, blink = ev.kind === 'blink';
      const prev = F.B.billboard; F.B.billboard = null;
      decal(K.Crack, ev.x, ev.y, r * 0.5, r, big ? 9 : 6, [0.09, 0.07, 0.05], big ? 0.85 : 0.7, { add: 0, sq: 0.5, rot, ease: 8, fin: 0.02 });
      decal(K.Ink1, ev.x, ev.y, r * 0.3, r * 0.62, big ? 9 : 6, [0.12, 0.09, 0.07], 0.5, { add: 0, sq: 0.5, rot: rot + 1, ease: 8, fin: 0.02 });
      decal(K.Crack, ev.x, ev.y, r * 0.4, r * 0.85, 1.4, blink ? [0.75, 0.6, 1] : [1, 0.7, 0.35], big ? 0.7 : 0.45, { add: 1, sq: 0.5, rot, ease: 6, fin: 0.02 });   // 刚砸开时裂缝里透一点热光
      F.shockRing(ev.x, ev.y, r * 1.2, cc, 0.4, 0.55, 0.5, true);
      F.shockRing(ev.x, ev.y, r * 1.8, DUST, 0.6, 0.55, 0.32, true);
      F.shock(ev.x, ev.y, r * 2.2, big ? 26 : 13, big ? 0.6 : 0.4);
      F.smokeRing(ev.x, ev.y, r * 1.4, DUST, 0.42, 1.0);
      F.B.billboard = { x: ev.x, y: ev.y };
      for (let i = 0; i < (big ? 30 : 14); i++) { const a = Math.random() * TAU, v = rnd(160, big ? 560 : 380); F.emit({ x: ev.x + Math.cos(a) * r * 0.2, y: ev.y - 10, vx: Math.cos(a) * v, vy: -rnd(260, big ? 820 : 500), life: rnd(0.6, 1.1), s0: rnd(5, 12), s1: 3, c: [0.4, 0.33, 0.25], add: 0, a: 0.95, grav: 1500, drag: 0.6, cell: C.Shard, rot: a, vr: rnd(-10, 10) }); }
      for (let i = 0; i < (big ? 10 : 5); i++) { const a = Math.random() * TAU; F.emit({ x: ev.x + Math.cos(a) * r * 0.3, y: ev.y - 10, vx: Math.cos(a) * rnd(120, 300), vy: rnd(-90, -30), life: rnd(0.8, 1.4), s0: rnd(30, 46), s1: 110, c: DUST, a: 0.32, add: 0, cell: smokeCell(), drag: 2.4, rot: Math.random() * TAU }); }
      if (big) {
        F.flash(ev.x, ev.y - 30, 30, core, 0.15);
        F.beam(ev.x, ev.y + 10, ev.x, ev.y - 480, 56, cc, 0.25); F.beam(ev.x, ev.y + 10, ev.x, ev.y - 480, 14, core, 0.65);
        F.rays(ev.x, ev.y - 40, 170, cc, 0.32, 0.3);
        F.sparks(ev.x, ev.y - 20, core, 40, 1150, 0.5, 3.6);
      } else F.sparks(ev.x, ev.y - 20, core, 14, 620, 0.35, 2.8, dir, 2.4);
      if (blink) { F.flash(ev.x, ev.y - 40, 22, [0.85, 0.75, 1], 0.14); for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; F.emit({ x: ev.x, y: ev.y - 20, vx: Math.cos(a) * 700, vy: Math.sin(a) * 260 - 120, life: 0.3, s0: 5, s1: 1.5, c: [0.8, 0.7, 1], a: 0.85, drag: 3, stretch: 0.03, cell: C.Glow }); } }
      F.B.billboard = prev;
      break;
    }
    case 'blinkstep': {
      // 缩地：原地一团墨影散开（覆盖混合的墨丝往上飘），落点一记紫白的收拢闪；中间一道淡淡的墨痕
      const x2 = ev.x2 ?? ev.x, y2 = ev.y2 ?? ev.y, INK: RGB = [0.08, 0.06, 0.12];
      for (let i = 0; i < 16; i++) F.emit({ x: ev.x + rnd(-22, 22), y: ev.y + rnd(-60, 50), vx: rnd(-50, 50), vy: rnd(-90, -20), life: rnd(0.5, 0.9), s0: rnd(26, 40), s1: rnd(60, 90), c: INK, a: 0.5, add: 0, cell: i % 2 ? C.Wisp : smokeCell(), rot: rnd(-0.4, 0.4), drag: 1.5 });
      F.ink(ev.x, ev.y + 40, 120, 0.4, INK);
      if (extOK()) F.emit({ x: ev.x, y: ev.y, life: 0.5, s0: 60, s1: 150, c: INK, a: 0.45, add: 0, cell: C.KTwirl, rot: Math.random() * TAU, vr: -5 });
      const prev = F.B.billboard; F.B.billboard = null;
      const L = Math.hypot(x2 - ev.x, y2 - ev.y) || 1, n = Math.min(26, Math.max(5, Math.round(L / 60)));
      for (let i = 1; i < n; i++) { const u = i / n; F.emit({ x: ev.x + (x2 - ev.x) * u, y: ev.y + (y2 - ev.y) * u, life: rnd(0.2, 0.4), s0: 40, s1: 14, c: cc, a: 0.18, cell: C.Glow }); }
      F.B.billboard = { x: x2, y: y2 + 60 };
      F.flash(x2, y2, 20, mixc(cc, WHITE, 0.5), 0.15);
      for (let i = 0; i < 18; i++) { const a = i / 18 * TAU; F.emit({ x: x2 + Math.cos(a) * 120, y: y2 + Math.sin(a) * 76, vx: -Math.cos(a) * 560, vy: -Math.sin(a) * 350, life: 0.2, s0: 6, s1: 2, c: mixc(cc, WHITE, 0.4), a: 0.85, cell: C.Glow }); }
      F.B.billboard = prev;
      break;
    }
    case 'tech': {
      // 脱困：身形一定，一圈冲开的震波（竖环 + 地环）、碎光、放射光
      const r = ev.r ?? 280;
      F.flash(ev.x, ev.y, 24, core, 0.15);
      F.shockRing(ev.x, ev.y, r * 0.6, cc, 0.35, 0.9, 0.65);
      F.shockRing(ev.x, ev.y, r * 0.95, cc, 0.5, 0.85, 0.32);
      F.shock(ev.x, ev.y, r * 1.5, 16, 0.45);
      F.rays(ev.x, ev.y, r * 0.45, cc, 0.32, 0.25);
      for (let i = 0; i < 30; i++) { const a = i / 30 * TAU; F.emit({ x: ev.x, y: ev.y, vx: Math.cos(a) * 950, vy: Math.sin(a) * 620, life: 0.28, s0: 5, s1: 1.5, c: core, a: 0.85, drag: 3, stretch: 0.03, cell: C.Glow }); }
      if (extOK()) F.emit({ x: ev.x, y: ev.y, life: 0.3, s0: 60, s1: 140, c: cc, a: 0.3, cell: C.KBubble });
      break;
    }
    case 'splash': {
      // 落水 / 打水漂：贴水面两圈白浪、水珠往上溅、水雾（第三轮：打水漂一串下来圈太多太亮，压淡）
      const k = Math.max(1, p);
      flat(F, () => { F.shockRing(ev.x, ev.y, 160 * k, WAVE, 0.6, 0.5, 0.3, true); F.shockRing(ev.x, ev.y, 260 * k, SEA, 0.9, 0.5, 0.18, true); decal(K.Wave8, ev.x, ev.y, 40 * k, 220 * k, 1.1, FOAM, 0.45, { add: 0, sq: 0.5, ease: 3 }); });
      F.B.billboard = { x: ev.x, y: ev.y };
      for (let i = 0; i < 26 * k; i++) { const a = Math.random() * TAU, v = rnd(80, 300) * k; F.emit({ x: ev.x + Math.cos(a) * 20, y: ev.y - 6, vx: Math.cos(a) * v, vy: -rnd(300, 700) * Math.sqrt(k), life: rnd(0.6, 1.0), s0: rnd(3, 6), s1: 2, c: FOAM, a: 0.9, grav: 1300, cell: C.Glow }); }
      F.smoke(ev.x, ev.y - 20, Math.round(6 * k), [0.85, 0.92, 1], 0.3, 40, 70);
      break;
    }
    case 'pillar': {
      // 砸海：冲天水柱由场景件 column 每帧画（粗、高、先冲后塌、顶上水冠、落下水幕、浪环）；这里是爆开那一下
      piece({ k: 'column', x: ev.x, y: ev.y, t: 0, dur: 2.2 + Math.max(0, p - 2) * 0.35, p: Math.max(1.2, p), r: ev.r ?? 220 });
      const k = Math.max(1.2, p), W = 70 + k * 26, r = ev.r ?? 220;
      // 水面：一圈压下去的暗心、两圈往外推的浪（普通混合、压着亮度：上一版整片发白，泛光一照像一根光柱）
      flat(F, () => {
        decal(K.Ink1, ev.x, ev.y, r * 0.3, r * 0.95, 2.4, DEEP, 0.65, { add: 0, sq: 0.5, rot: Math.random() * TAU, ease: 6 });
        decal(K.Wave8, ev.x, ev.y, r * 0.3, r * 1.6, 2, WAVE, 0.4, { add: 0, sq: 0.5, ease: 3 });
        for (let i = 0; i < 2; i++) F.shockRing(ev.x, ev.y, r * (1 + i * 0.9), i ? SEA : WAVE, 0.6 + i * 0.35, 0.5, 0.3, true);
        F.shock(ev.x, ev.y, r * 2.8, 24, 0.7);
      });
      F.B.billboard = { x: ev.x, y: ev.y };
      // 爆开那一下：贴水面往四下溅的水珠、一圈翻起的水雾
      for (let i = 0; i < 36; i++) { const a = Math.random() * TAU, v = rnd(200, 560) * k * 0.6; F.emit({ x: ev.x + Math.cos(a) * W * 0.3, y: ev.y - 8, vx: Math.cos(a) * v, vy: -rnd(300, 900), life: rnd(0.7, 1.2), s0: rnd(4, 8), s1: 2, c: i % 3 ? WAVE : SEA, a: 0.95, add: 0, grav: 1500, cell: C.Glow }); }
      for (let i = 0; i < 10; i++) { const a = Math.random() * TAU; F.emit({ x: ev.x + Math.cos(a) * r * 0.4, y: ev.y - 20, vx: Math.cos(a) * rnd(160, 360), vy: rnd(-90, -20), life: rnd(1.2, 2), s0: rnd(40, 60), s1: rnd(130, 190), c: [0.7, 0.82, 0.88], a: 0.3, add: 0, cell: smokeCell(), drag: 1.6, rot: Math.random() * TAU }); }
      break;
    }
    case 'wake': {
      // 犁水：身后一道白浪水沟（贴水面的白条 + 两侧翻起的水墙，往中间合上），水沫四溅
      const a = ev.dir ?? 0, ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux, k = Math.min(2.5, p);
      // 第三轮：V 形水墙——两侧各一片斜着往外翻的水墙（场景件，活一秒多），身后留一条长长的白浪（贴花，留几息）
      piece({ k: 'vwall', x: ev.x, y: ev.y, t: 0, dur: 1.1, p: k, r: a });
      flat(F, () => { decal(K.Brush0, ev.x - ux * 30, ev.y - uy * 30, 30 * k, 46 * k, 4.5, FOAM, 0.55, { add: 0, sq: 0.5, rot: a, ease: 3, fin: 0.03 }); for (const s of [-1, 1]) decal(K.Brush1, ev.x - ux * 60 + nx * s * 70 * k, ev.y - uy * 60 + ny * s * 42 * k, 26 * k, 60 * k, 3.5, FOAM, 0.45, { add: 0, sq: 0.5, rot: a + s * 0.45, ease: 3, fin: 0.03 }); });
      flat(F, () => {
        // 沟两侧翻起的白沫（一块块墨溅形的水沫，普通混合），沟心一道压下去的深色
        for (const s of [-1, 1]) decal(K.Ink2, ev.x + nx * s * 34 * k, ev.y + ny * s * 20 * k, 24 * k, 52 * k, 2.6, FOAM, 0.8, { add: 0, sq: 0.5, rot: a + rnd(-0.6, 0.6), ease: 3, fin: 0.05 });
        decal(K.Ink1, ev.x, ev.y, 18 * k, 30 * k, 1.8, DEEP, 0.4, { add: 0, sq: 0.5, rot: a, ease: 3, fin: 0.05 });
      });
      F.B.billboard = { x: ev.x, y: ev.y };
      // 水墙：两侧的水往上翻起、往沟心倒回去（合上）
      for (const s of [-1, 1]) for (let i = 0; i < 8; i++) {
        const off = rnd(36, 70) * k;
        F.emit({ x: ev.x + nx * off * s, y: ev.y + ny * off * s * 0.6 - 4, vx: -nx * s * rnd(60, 160) - ux * rnd(40, 160), vy: -rnd(260, 560) * Math.sqrt(k), life: rnd(0.55, 0.9), s0: rnd(7, 13), s1: 4, c: i % 3 ? FOAM : SEA, a: 0.9, add: 0, grav: 1400, stretch: 0.015, cell: C.Glow });
      }
      if (Math.random() < 0.6) F.emit({ x: ev.x + rnd(-20, 20), y: ev.y - 6, vx: -ux * 60, vy: -rnd(120, 260), life: rnd(0.5, 0.8), s0: rnd(18, 26) * k, s1: rnd(40, 60) * k, c: FOAM, a: 0.6, add: 0, cell: C.Water, rot: a, grav: 600 });
      if (Math.random() < 0.5) F.emit({ x: ev.x, y: ev.y - 10, vx: -ux * 120, vy: -40, life: rnd(0.6, 1), s0: 30, s1: 80, c: [0.9, 0.95, 1], a: 0.25, add: 0, cell: smokeCell(), drag: 2 });
      break;
    }
    case 'breach': {
      // 破水而出：一股往上的水花和一小截水柱，外翻两圈浪
      flat(F, () => { F.shockRing(ev.x, ev.y, 140 * p, FOAM, 0.55, 0.5, 0.9, true); F.shockRing(ev.x, ev.y, 220 * p, SEA, 0.8, 0.5, 0.55, true); });
      F.B.billboard = { x: ev.x, y: ev.y };
      F.beam(ev.x, ev.y + 6, ev.x, ev.y - 180 * p, 40 * p, FOAM, 0.5);
      for (let i = 0; i < 36; i++) { const a = Math.random() * TAU, v = rnd(80, 260); F.emit({ x: ev.x + Math.cos(a) * 18, y: ev.y - 10, vx: Math.cos(a) * v, vy: -rnd(400, 900), life: rnd(0.6, 1.0), s0: rnd(3, 6), s1: 2, c: FOAM, a: 0.9, grav: 1500, cell: C.Glow }); }
      break;
    }
    case 'rubble': {
      // 撞碎石头 / 枯树 / 船骸：一地碎石贴花、往外崩的石块、一大团尘、一圈尘浪；在水里的礁石再溅一圈水
      const r = ev.r ?? 60, kind = ev.kind ?? 'boulder', small = p < 0.6;
      const STONE: RGB = kind === 'reef' ? [0.12, 0.14, 0.16] : kind === 'tree' || kind === 'wreck' ? [0.32, 0.22, 0.14] : [0.42, 0.38, 0.33];
      const a0 = ev.dir ?? 0;
      if (!small) flat(F, () => {
        decal(K.Ink2, ev.x, ev.y, r * 0.8, r * 1.6, 14, [0.16, 0.13, 0.1], 0.55, { add: 0, sq: 0.5, rot: Math.random() * TAU, ease: 8, fin: 0.03 });
        decal(K.Crack, ev.x, ev.y, r * 0.6, r * 1.4, 14, [0.1, 0.08, 0.06], 0.6, { add: 0, sq: 0.5, rot: Math.random() * TAU, ease: 8, fin: 0.03 });
        F.shockRing(ev.x, ev.y, r * 2.4, DUST, 0.5, 0.55, 0.45, true);
        F.shock(ev.x, ev.y, r * 3, 14, 0.4);
      });
      F.B.billboard = { x: ev.x, y: ev.y };
      const n = small ? 6 : 34;
      for (let i = 0; i < n; i++) { const a = (Math.random() < 0.6 ? a0 + rnd(-1, 1) : Math.random() * TAU), v = rnd(200, 700) * (small ? 0.4 : 1); F.emit({ x: ev.x + rnd(-r, r) * 0.5, y: ev.y - rnd(20, 90), vx: Math.cos(a) * v, vy: -rnd(200, 760) * (small ? 0.5 : 1), life: rnd(0.7, 1.3), s0: rnd(5, 14), s1: 3, c: mixc(STONE, WHITE, rnd(0, 0.25)), a: 1, add: 0, grav: 1600, drag: 0.4, cell: C.Shard, rot: a, vr: rnd(-12, 12) }); }
      for (let i = 0; i < (small ? 2 : 10); i++) { const a = Math.random() * TAU; F.emit({ x: ev.x + Math.cos(a) * r * 0.4, y: ev.y - rnd(10, 60), vx: Math.cos(a) * rnd(100, 260) + Math.cos(a0) * 120, vy: rnd(-120, -30), life: rnd(1, 1.8), s0: rnd(36, 56), s1: rnd(110, 160), c: kind === 'reef' ? [0.7, 0.78, 0.82] : DUST, a: 0.4, add: 0, cell: smokeCell(), drag: 1.8, rot: Math.random() * TAU }); }
      if (!small) { F.flash(ev.x, ev.y - 50, 26, [1, 0.9, 0.7], 0.12); F.sparks(ev.x, ev.y - 40, [1, 0.85, 0.6], 18, 800, 0.35, 3, a0, 1.6); }
      if (ev.big) brawlEvent(F, { k: 'splash', x: ev.x, y: ev.y, power: 1.6 });
      break;
    }
    case 'bxguard': {
      // 破罡：护体罡气碎成金片四散——先是一圈六角罩的裂光，再炸成大小不一的金片和光屑
      hitFlash(F, ev.x, ev.y, 24, core, 0.15);
      F.shockRing(ev.x, ev.y, 90, core, 0.3, 0.9, 0.8);
      F.shockRing(ev.x, ev.y, 150, cc, 0.5, 0.85, 0.35);
      if (extOK()) F.emit({ x: ev.x, y: ev.y, life: 0.22, s0: 90, s1: 150, c: core, a: hfSetting.on ? 0.2 : 0.55, cell: C.KBubble });   // r9-hitfeel：六角罩的碎光压淡（整颗亮球盖住人）
      const n = 30 + (p >= 3 ? 14 : 0);
      for (let i = 0; i < n; i++) { const a = Math.random() * TAU, v = rnd(260, 700); F.emit({ x: ev.x + Math.cos(a) * 50, y: ev.y + Math.sin(a) * 60, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.7 - 100, life: rnd(0.5, 0.9), s0: rnd(10, 22), s1: 3, c: mixc(cc, WHITE, rnd(0.1, 0.5)), a: 0.95, drag: 1.4, grav: 480, cell: C.Shard, rot: a, vr: rnd(-9, 9) }); }
      for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; F.emit({ x: ev.x, y: ev.y, vx: Math.cos(a) * 900, vy: Math.sin(a) * 600, life: 0.22, s0: 4, s1: 1, c: WHITE, a: 0.9, stretch: 0.03, drag: 3, cell: C.Glow }); }
      if (!hfSetting.on) F.glint(ev.x, ev.y, 26, core, 0.85, 0.22);
      F.shock(ev.x, ev.y, 220, 12, 0.35);
      break;
    }
    case 'bxcharge': {
      // 蓄力：光点从四周往拳上收拢、一圈收缩的光环、拳上一团越来越亮的光（r = 前摇多长）
      const T = Math.max(0.08, ev.r ?? 0.14), heavy = p >= 2;
      for (let i = 0; i < (heavy ? 18 : 10); i++) { const a = Math.random() * TAU, R = rnd(70, heavy ? 150 : 100); F.emit({ x: ev.x + Math.cos(a) * R, y: ev.y + Math.sin(a) * R * 0.8, vx: -Math.cos(a) * R / T, vy: -Math.sin(a) * R * 0.8 / T, life: T, s0: rnd(3, 5), s1: 1.5, c: i % 2 ? WHITE : cc, a: 0.9, stretch: 0.02, cell: C.Glow }); }
      F.emit({ x: ev.x, y: ev.y, life: T + 0.05, s0: heavy ? 120 : 80, s1: 20, c: cc, a: 0.45, cell: C.Ring });
      F.emit({ x: ev.x, y: ev.y, life: T + 0.06, s0: 10, s1: heavy ? 44 : 28, c: core, a: 0.8, cell: C.Glow });
      if (heavy) F.glint(ev.x, ev.y, 18, core, 0.7, T + 0.05);
      break;
    }
    case 'bxblock': {
      // 撞阵被拦：一面六角光罩迎面一亮，火花往回崩
      F.flash(ev.x, ev.y, 20, core, 0.14);
      if (extOK()) F.emit({ x: ev.x, y: ev.y, life: 0.3, s0: 90, s1: 130, c: cc, a: 0.6, cell: C.KBubble });
      F.shockRing(ev.x, ev.y, 110, cc, 0.35, 0.9, 0.7);
      F.sparks(ev.x, ev.y, core, 26, 700, 0.4, 3);
      F.shock(ev.x, ev.y, 180, 10, 0.3);
      break;
    }
    case 'meteor': {
      // 坠地大坑：放射裂纹（一圈转开的裂纹贴花叠出放射的样子）、坑心的暗、裂缝里的热光、地面冲击波、尘穹、飞溅的大石块、一截冲天的光
      const r = ev.r ?? 360, k = Math.max(1, p / 3), big = !!ev.big, tight = ev.kind === 'tight';   // tight：亮光只留坑口一圈、很快退（撼山客千钧坠）
      flat(F, () => {
        for (let i = 0; i < 5; i++) decal(K.Crack, ev.x, ev.y, r * 0.5, r * (1.05 + i * 0.12), 12, [0.07, 0.05, 0.04], 0.8, { add: 0, sq: 0.5, rot: i * 1.257 + Math.random() * 0.3, ease: 10, fin: 0.01 });
        decal(K.Ink1, ev.x, ev.y, r * 0.35, r * 0.7, 12, [0.06, 0.045, 0.035], 0.75, { add: 0, sq: 0.5, rot: Math.random() * TAU, ease: 10, fin: 0.01 });
        decal(K.Ink2, ev.x, ev.y, r * 0.6, r * 1.3, 10, [0.16, 0.12, 0.09], 0.4, { add: 0, sq: 0.5, rot: Math.random() * TAU, ease: 8, fin: 0.02 });
        for (let i = 0; i < 3; i++) decal(K.Crack, ev.x, ev.y, r * 0.45, r * (0.9 + i * 0.15), 2.6, [1, 0.55, 0.2], 0.6, { add: 1, sq: 0.5, rot: i * 2.1, ease: 6, fin: 0.01 });   // 裂缝里透热光，两三息后冷下去
        F.shockRing(ev.x, ev.y, r * (tight ? 0.75 : 1.6), [1, 0.8, 0.5], tight ? 0.28 : 0.45, 0.55, tight ? 0.4 : 0.55, true);
        F.shockRing(ev.x, ev.y, r * 2.6, DUST, 0.8, 0.55, 0.45, true);
        F.shockRing(ev.x, ev.y, r * 3.6, DUST, 1.1, 0.55, 0.25, true);
        F.shock(ev.x, ev.y, r * 3, 30, 0.75);
        F.smokeRing(ev.x, ev.y, r * 1.7, DUST, 0.5, 1.4);
      });
      F.B.billboard = { x: ev.x, y: ev.y };
      F.flash(ev.x, ev.y - 40, (tight ? 22 : 40) * k, [1, 0.9, 0.7], tight ? 0.12 : 0.16);
      if (big) { F.beam(ev.x, ev.y + 10, ev.x, ev.y - 900, 90, [1, 0.65, 0.3], 0.2); F.beam(ev.x, ev.y + 10, ev.x, ev.y - 900, 22, [1, 0.95, 0.8], 0.6); }
      // 飞石：大块的往外崩、带旋转，小块的碎屑往上喷
      for (let i = 0; i < 26 * k; i++) { const a = Math.random() * TAU, v = rnd(260, 820) * k; F.emit({ x: ev.x + Math.cos(a) * r * 0.25, y: ev.y - 10, vx: Math.cos(a) * v, vy: -rnd(500, 1300), life: rnd(0.9, 1.6), s0: rnd(12, 26), s1: 8, c: mixc([0.38, 0.32, 0.25], WHITE, rnd(0, 0.15)), add: 0, a: 1, grav: 1700, drag: 0.4, cell: C.Shard, rot: a, vr: rnd(-12, 12) }); }
      for (let i = 0; i < 30 * k; i++) { const a = Math.random() * TAU, v = rnd(150, 520); F.emit({ x: ev.x + Math.cos(a) * r * 0.2, y: ev.y - 10, vx: Math.cos(a) * v, vy: -rnd(300, 900), life: rnd(0.6, 1.1), s0: rnd(4, 9), s1: 3, c: [0.3, 0.25, 0.2], add: 0, a: 1, grav: 1600, cell: C.Shard, rot: a, vr: rnd(-15, 15) }); }
      // 尘穹：一圈往外翻、往上鼓的尘
      for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; F.emit({ x: ev.x + Math.cos(a) * r * 0.5, y: ev.y - 20, vx: Math.cos(a) * rnd(260, 520), vy: -rnd(60, 220), life: rnd(1.4, 2.2), s0: rnd(60, 90), s1: rnd(180, 260), c: DUST, a: 0.42, add: 0, cell: smokeCell(), drag: 1.8, rot: Math.random() * TAU }); }
      F.sparks(ev.x, ev.y - 30, [1, 0.8, 0.5], 40, 1300, 0.5, 3.8);
      F.rays(ev.x, ev.y - 40, r * 0.6, [1, 0.75, 0.4], 0.35, 0.3);
      break;
    }
    case 'voidpunch': {
      // 坠界那一拳 / 御剑高度把人砸下去：往下贯穿的一道光柱、爆闪、两层冲击环、往下喷的气流
      const k = p / 3;
      hitFlash(F, ev.x, ev.y, 34 * k + 10, core, 0.16);
      F.shockRing(ev.x, ev.y, 120 * k + 40, core, 0.3, 0.9, 0.8);
      F.shockRing(ev.x, ev.y, 220 * k + 60, cc, 0.5, 0.85, 0.4);
      F.shock(ev.x, ev.y, 420 * k + 120, 26, 0.55);
      // 光柱：顺着砸下去的方向（往下）一道窄而亮的光，外层很淡（第一版太宽，虚空斗法场里看着是一块橙色的扇面）
      F.beam(ev.x, ev.y - 30, ev.x, ev.y + 700, 46 * k, cc, 0.16);
      F.beam(ev.x, ev.y - 30, ev.x, ev.y + 700, 16 * k, core, 0.5);
      F.beam(ev.x, ev.y - 20, ev.x, ev.y + 560, 6, WHITE, 0.85);
      for (let i = 0; i < 30; i++) { const a = Math.PI / 2 + rnd(-0.35, 0.35), v = rnd(1600, 3000); F.emit({ x: ev.x, y: ev.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rnd(0.15, 0.3), s0: rnd(3, 6), s1: 1, c: i % 3 ? WHITE : core, a: 0.9, drag: 4, stretch: 0.04, cell: C.Glow }); }
      F.rays(ev.x, ev.y, 160 * k + 40, cc, 0.3, 0.26);
      if (extOK()) F.emit({ x: ev.x, y: ev.y, life: 0.22, s0: 80, s1: 220, c: cc, a: hfSetting.on ? 0.2 : 0.5, cell: C.KBurst1, rot: Math.random() * TAU });
      break;
    }
    case 'bxwhit': case 'bxquake': bladeEvent(F, ev); break;   // 兵器：命中的斩痕火花、重兵砸地的震波（gl/bladegl.ts）
    case 'clashring': {
      // 拼招相持时两股气劲之间挤出的一圈冲击环（竖着、往外扩）
      F.shockRing(ev.x, ev.y, 90 + p * 40, mixc(col(ev.color ?? '255,220,160'), WHITE, 0.3), 0.32, 0.9, 0.7);
      F.shock(ev.x, ev.y, 160, 8, 0.25);
      break;
    }
    case 'clash': {
      // 拼招：两人拳对拳顶住，脚下压出一圈凹陷的气场——地上是裂纹和尘圈，水面是一圈被压下去的水和外翻的浪；
      // r = 1 开拼、0 拼点时的一下、2 结果（一方被震飞）
      const water = ev.kind === 'water', stage = ev.r ?? 0;
      const hy = ev.y - 46 - 62;   // 两人悬停后拳头的高度
      flat(F, () => {
        if (stage >= 1) {
          if (water) {
            decal(K.Ink1, ev.x, ev.y, 80, 260, stage === 2 ? 2.5 : 3.2, DEEP, 0.6, { add: 0, sq: 0.5, rot: Math.random() * TAU, ease: 5 });
            decal(K.Wave12, ev.x, ev.y, 60, 320 + stage * 80, 1.6, FOAM, 0.45, { add: 0, sq: 0.5, ease: 3 });
            for (let i = 0; i < 3; i++) F.shockRing(ev.x, ev.y, 200 + i * 120 + stage * 60, i % 2 ? SEA : FOAM, 0.6 + i * 0.25, 0.5, 0.55 - i * 0.12, true);
          } else {
            decal(K.Crack, ev.x, ev.y, 120, 260 + stage * 60, 7, [0.08, 0.06, 0.05], 0.85, { add: 0, sq: 0.5, rot: Math.random() * TAU, ease: 6, fin: 0.02 });
            decal(K.Crack, ev.x, ev.y, 100, 220 + stage * 40, 1.5, [1, 0.75, 0.4], 0.5, { add: 1, sq: 0.5, rot: Math.random() * TAU, ease: 5, fin: 0.02 });
            decal(K.Ink2, ev.x, ev.y, 60, 160, 7, [0.1, 0.08, 0.06], 0.5, { add: 0, sq: 0.5, ease: 6, fin: 0.02 });
            F.shockRing(ev.x, ev.y, 260 + stage * 80, DUST, 0.7, 0.55, 0.5, true);
            F.smokeRing(ev.x, ev.y, 220 + stage * 60, DUST, 0.5, 1.1);
          }
          F.shock(ev.x, ev.y, 300 + stage * 120, 18 + stage * 6, 0.55);
        } else F.shockRing(ev.x, ev.y, 160, water ? FOAM : [1, 0.85, 0.55], 0.3, 0.55, 0.6, true);
      });
      F.B.billboard = { x: ev.x, y: ev.y };
      const gold: RGB = [1, 0.84, 0.45];
      // 光都压小、压短：拳头上一闪即逝，人始终看得清（第一版截图里整团白光把两人都糊住了）
      F.flash(ev.x, hy, stage === 2 ? 20 : stage === 1 ? 16 : 8, mixc(gold, WHITE, 0.5), stage ? 0.09 : 0.06);
      F.shockRing(ev.x, hy, stage === 2 ? 220 : stage === 1 ? 150 : 70, gold, stage ? 0.4 : 0.2, 0.9, stage ? 0.6 : 0.45);
      if (stage) { F.rays(ev.x, hy, stage === 2 ? 150 : 110, gold, 0.18, 0.2); F.glint(ev.x, hy, 14, WHITE, 0.55, 0.16); }
      F.sparks(ev.x, hy, mixc(gold, WHITE, 0.4), stage === 2 ? 32 : stage === 1 ? 22 : 10, stage === 2 ? 1300 : 900, 0.35, 2.8);
      if (stage === 2 && ev.dir !== undefined) { const a = ev.dir; F.beam(ev.x, hy, ev.x + Math.cos(a) * 600, hy + Math.sin(a) * 420, 40, gold, 0.16); F.beam(ev.x, hy, ev.x + Math.cos(a) * 560, hy + Math.sin(a) * 390, 8, WHITE, 0.5); }
      if (water) for (let i = 0; i < (stage ? 40 : 10); i++) { const a = Math.random() * TAU, v = rnd(120, 420) * (stage ? 1 : 0.5); F.emit({ x: ev.x + Math.cos(a) * 160, y: ev.y - 6, vx: Math.cos(a) * v, vy: -rnd(200, 700), life: rnd(0.6, 1.1), s0: rnd(4, 7), s1: 2, c: FOAM, a: 0.9, grav: 1400, cell: C.Glow }); }
      break;
    }
  }
}

/** 一条飞行尾迹：暗底（覆盖混合，压住背景）、热色光带、白芯；k 是亮度、w 是宽度倍率 */
function streak(F: FxSys, T: readonly FlightPoint[], cc: RGB, k: number, w = 1) {
  if (T.length < 2) return;
  // 第三轮：做成粗壮的能量带——暗底压住背景、外层宽热浪、中层金带、亮芯、白芯（加色层都偏窄、偏淡：泛光下不糊）
  // r9：暗底收窄收淡（推近之后被打飞的人身后拖一条半人宽的深色长条，像一根黑棍）
  F.flightTrail(T, 60 * w, [0.12, 0.09, 0.07], 0.07 * k, C.Glow, 0, 0.5);
  F.flightTrail(T, 120 * w, mixc(cc, [1, 0.35, 0.1], 0.4), 0.2 * k, C.Glow, 1, 0.55);
  F.flightTrail(T, 66 * w, cc, 0.36 * k, C.Beam, 1, 0.75);
  F.flightTrail(T, 28 * w, mixc(cc, WHITE, 0.5), 0.55 * k, C.Beam, 1, 1);
  F.flightTrail(T, 8 * w, WHITE, 0.8 * k, C.Beam, 1, 1);
}

/** 场景件：每帧按时间重画的大件（水柱、V 形水墙），最多 10 件 */
interface Piece { k: 'column' | 'vwall'; x: number; y: number; t: number; dur: number; p: number; r: number; acc?: number }
const pieces: Piece[] = [];
function piece(q: Piece) { if (pieces.length >= 10) pieces.shift(); pieces.push(q); }
/** 测试 / 截图：现在有几件 */
export const brawlPieces = () => pieces.length;
/** 画面上沿在世界里的 y（水柱不许冲出画面：顶到这条线以下一成就停）——drawBrawlGL 每帧按镜头算 */
let viewTop = -Infinity;
function drawPieces(F: FxSys, dt: number) {
  for (let i = pieces.length - 1; i >= 0; i--) {
    const q = pieces[i]; q.t += dt;
    if (q.t >= q.dur) { pieces.splice(i, 1); continue; }
    if (q.k === 'column') column(F, q, dt, viewTop); else vwall(F, q, dt);
  }
  F.B.billboard = null;
}
/**
 * 大水柱：0.22 息冲到顶（高 600～1300、底宽 160～300），在顶上停一下，然后从上往下塌；
 * 柱身是一条普通混合的白水带（三层：淡蓝的外缘、白的柱身、更白的芯），顶上一团水冠不断往外喷水珠，塌的时候四周落下水幕；
 * 水面上一圈圈往外推的浪环。
 */
function column(F: FxSys, q: Piece, dt: number, top0 = -Infinity) {
  // 宽度按「光带宽」算（beam 的宽是画面上的条宽），比世界单位窄一截，所以乘得大
  // 收官 B4 / 打磨：高度再按镜头压——镜头拉近时原来的高度顶出画面（顶上的水冠看不见，只剩一截发亮的柱身）
  const u = q.t / q.dur, k = q.p, Hmax = Math.max(160, Math.min(640, 260 + k * 88, (q.y - top0) * 0.3)), W = 190 + k * 80;   // 实拍量出来：斜视角下立板的一单位高在画面上约是地面一单位的两倍，所以按「到画面上沿的距离」的三成取，顶上留一成余地
  const hk = Hmax / Math.min(640, 260 + k * 88);   // 被镜头压矮了多少：水冠、往上喷的水珠一起按这个比例收
  const rise = Math.min(1, q.t / 0.22), riseE = 1 - Math.pow(1 - rise, 3);
  const fall = u > 0.35 ? Math.min(1, (u - 0.35) / 0.65) : 0;
  const top = Hmax * riseE * (1 - fall * fall * 0.92), bot = Hmax * Math.pow(fall, 1.6) * 0.6;   // 塌的时候顶往下落、底也往上收（水往下砸回去）
  const alpha = (1 - Math.pow(u, 3));
  F.B.billboard = { x: q.x, y: q.y };
  if (top - bot > 20) {
    const y0 = q.y - bot, y1 = q.y - top, wB = W * (1 - fall * 0.4), wT = W * 0.62;
    // 柱身：深青的外缘（压住背景、有体积）、青蓝的水身、两道竖的白浪纹；不画白芯（泛光会把它变成光柱）
    F.beam(q.x, y0 + 10, q.x, y1, wB * 1.9, WALL, 0.4 * alpha, C.Beam, 0);
    F.beam(q.x, y0 + 10, q.x, y1 + 20, wB * 1.2, BODY, 0.5 * alpha, C.Beam, 0);
    for (const s of [-0.28, 0.22]) F.beam(q.x + wB * s, y0, q.x + wT * s * 0.8, y1 + 50, wB * 0.18, WAVE, 0.45 * alpha, C.Beam, 0);
    // 柱身的翻涌：几团沿柱身往上走的水团（按时间取相位，帧间连续，不进粒子池）
    for (let i = 0; i < 9; i++) {
      const ph = (q.t * 1.6 + i / 9) % 1, yy = y0 + (y1 - y0) * ph, w = (wB + (wT - wB) * ph) * (0.9 + 0.2 * Math.sin(i * 7.3 + q.t * 9));
      F.sprite(i % 3 ? C.Water : C.Glow, q.x + Math.sin(i * 3.1 + q.t * 6) * w * 0.15, yy, w * 1.3, w * 1.1, Math.sin(i * 2.7) * 0.4, i % 2 ? WAVE : BODY, 0.5 * alpha, 0);
    }
    // 水冠：顶上一团往外开的水花，四下喷水珠
    F.sprite(C.Water, q.x, y1 + 10, wT * 3.4, wT * 2.6 * hk, 0, WAVE, 0.6 * alpha, 0);
    F.sprite(C.Water, q.x, y1 - 10, wT * 2.2, wT * 1.8 * hk, 0.6, BODY, 0.6 * alpha, 0);
    q.acc = (q.acc ?? 0) + dt * (fall < 0.6 ? 90 : 30) * Math.min(1.6, k / 2.5);
    while (q.acc > 1) { q.acc--; const a = Math.random() * TAU, sp = rnd(120, 420) * Math.min(1.6, k / 2); F.emit({ x: q.x + Math.cos(a) * wT * 0.4, y: y1 + rnd(-20, 30), vx: Math.cos(a) * sp, vy: -rnd(150, 520) * hk, life: rnd(0.9, 1.5), s0: rnd(5, 10), s1: 2, c: Math.random() < 0.4 ? SEA : WAVE, a: 0.95, add: 0, grav: 1500, drag: 0.3, stretch: 0.02, cell: C.Glow }); }
  }
  // 落下的水幕：塌的时候四周一圈往下落的水帘
  if (fall > 0 && fall < 0.85 && Math.random() < dt * 40) for (let i = 0; i < 3; i++) { const a = Math.random() * TAU, R = W * rnd(0.8, 1.6); F.emit({ x: q.x + Math.cos(a) * R, y: q.y - top * rnd(0.3, 0.8), vx: Math.cos(a) * 60, vy: rnd(100, 300), life: rnd(0.5, 0.8), s0: rnd(26, 44), s1: rnd(50, 70), c: BODY, a: 0.45, add: 0, grav: 1400, cell: C.Water, rot: Math.random() * TAU }); }
  // 浪环：贴水面一圈圈往外推（一圈白沫一圈暗水，像真浪的起伏）
  F.B.billboard = null;
  for (let i = 0; i < 3; i++) {
    const ph = Math.min(1, u * 1.4 - i * 0.18); if (ph <= 0) continue;
    const R = q.r * (0.6 + ph * (2.4 + k * 0.25));
    F.ground(C.Ring, q.x, q.y, R, 0, WAVE, 0.4 * (1 - ph) * alpha, 0, 0.5);
    F.ground(C.Ring, q.x, q.y, R * 0.9, 0, DEEP, 0.3 * (1 - ph) * alpha, 0, 0.5);
  }
  F.ground(C.Disc, q.x, q.y, q.r * (0.8 + u * 0.6), 0, DEEP, 0.45 * (1 - u), 0, 0.5);
}
/** V 形水墙：从犁水的那一点往后两侧斜着翻起的两片水墙，翻起、往外倒、落回水面 */
function vwall(F: FxSys, q: Piece, dt: number) {
  const u = q.t / q.dur, a = q.r, ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux, k = q.p;
  const h = 170 * k * Math.sin(Math.min(1, u * 1.6) * Math.PI) * (1 - u * 0.4), al = 0.75 * (1 - u);
  if (h < 4) return;
  for (const s of [-1, 1]) {
    // 一片水墙：沿 V 的一条边排几团水，越往外越晚翻起、越矮
    for (let j = 0; j < 4; j++) {
      const off = (40 + j * 34) * k * (0.6 + u * 0.8), back = (j * 26 + u * 90) * k;
      const x = q.x - ux * back + nx * s * off, y = q.y - uy * back + ny * s * off * 0.6;
      const hh = h * (1 - j * 0.18);
      F.B.billboard = { x, y };
      F.sprite(C.Water, x, y - hh * 0.45, 70 * k * (1 - j * 0.12), hh, s * 0.35, WAVE, al, 0);
      F.sprite(C.Glow, x, y - hh * 0.3, 60 * k, hh * 0.7, 0, BODY, al * 0.5, 0);
    }
  }
  if (Math.random() < dt * 30) { const s = Math.random() < 0.5 ? -1 : 1; F.B.billboard = { x: q.x, y: q.y }; F.emit({ x: q.x + nx * s * 60 * k, y: q.y - h * 0.8, vx: nx * s * rnd(100, 260) - ux * 80, vy: -rnd(80, 240), life: rnd(0.5, 0.9), s0: rnd(4, 8), s1: 2, c: FOAM, a: 0.9, add: 0, grav: 1400, cell: C.Glow }); }
}

/** 画面这边自己的计时（音爆圈、气泡）：只在渲染里用 Math.random，不碰逻辑 */
const boomT = new WeakMap<object, number>();

/** 每帧：被击飞者的长尾迹与身边的风、音爆圈、贴地犁行的尘、沉在水里的气泡、欺身的光带、妖兽的残影、拼招的气场、架势的脚下光环 */
export function drawBrawlGL(F: FxSys, c: Combat, t: number, dt: number) {
  const B = c.brawl, p = c.game.player;
  const HOT: RGB = [1, 0.78, 0.45];
  { const cam = c.game.cam, vh = (typeof window !== 'undefined' ? window.innerHeight : 800) / Math.max(0.05, cam.zoom); viewTop = cam.y - vh / 2; }
  drawPieces(F, dt);
  // 流星（从高处被砸下去的人）：身上一团火、身后一路火舌与火星（尾迹本身是下面的 streak，这里加火）
  const fire = (x: number, y: number, z: number, vz: number) => {
    const hy = y - z - 50, sp = Math.max(400, Math.abs(vz));
    F.B.billboard = { x, y };
    F.glow(x, hy, 130, [1, 0.5, 0.15], 0.35); F.glow(x, hy, 60, [1, 0.92, 0.7], 0.45);
    if (Math.random() < dt * 70) for (let i = 0; i < 2; i++) F.emit({ x: x + rnd(-30, 30), y: hy + rnd(-30, 30), vx: rnd(-90, 90), vy: -sp * rnd(0.12, 0.3), life: rnd(0.25, 0.45), s0: rnd(26, 46), s1: 8, c: Math.random() < 0.5 ? [1, 0.55, 0.15] : [1, 0.82, 0.4], a: 0.8, cell: fireCell(), rot: rnd(-0.3, 0.3) });
    if (Math.random() < dt * 40) F.emit({ x: x + rnd(-20, 20), y: hy, vx: rnd(-140, 140), vy: -rnd(200, 500), life: rnd(0.3, 0.6), s0: 3, s1: 1, c: [1, 0.9, 0.6], a: 0.9, stretch: 0.03, cell: C.Glow });
    if (Math.random() < dt * 14) F.emit({ x: x + rnd(-20, 20), y: hy - 30, vx: rnd(-40, 40), vy: -rnd(80, 160), life: rnd(0.8, 1.2), s0: 40, s1: 110, c: [0.18, 0.13, 0.1], a: 0.35, add: 0, cell: smokeCell(), drag: 1.5, rot: Math.random() * TAU });
  };
  // r7-fx3d：立体的火尾（world/fx3d.ts，hsmoves3 每帧报）在画了，平面的这份就不画
  const F3 = c.game.renderer?.hd ? fx3dPeek(c.game)?.fires : undefined;
  for (const e of c.units) { const b = B.peek(e); if (b && b.air && b.meteor && !e.dead && !F3?.has('met-' + e.id)) fire(e.x, e.y, b.z, b.vz); }
  if (B.pb.air && B.pb.meteor && !F3?.has('met-p')) fire(p.x, p.y, B.pb.z, B.pb.vz);
  for (const e of c.units) {
    const b = B.peek(e);
    if (!b || e.dead) continue;
    if (b.subT > 0) {
      // 沉在水里：水面一圈圈涟漪、冒泡
      F.B.billboard = null;
      if (Math.random() < dt * 8) F.shockRing(b.subX, b.subY, rnd(60, 110), FOAM, 0.6, 0.5, 0.6, true);
      F.B.billboard = { x: b.subX, y: b.subY };
      if (Math.random() < dt * 30) F.emit({ x: b.subX + rnd(-40, 40), y: b.subY - 4, vx: rnd(-20, 20), vy: -rnd(40, 120), life: rnd(0.3, 0.6), s0: rnd(3, 6), s1: 1, c: FOAM, a: 0.8, cell: C.Glow });
      F.B.billboard = null;
      continue;
    }
    if (!b.trail.length) continue;
    const sp = Math.hypot(b.vx, b.vy);
    F.B.billboard = { x: e.x, y: e.y };
    const k = b.air ? Math.min(1.2, 0.4 + sp / 1600) : 0.8;
    streak(F, b.trail as FlightPoint[], b.air ? HOT : [1, 0.6, 0.4], k, b.air ? 1.1 : 0.6);
    if (b.air) {
      const hy = e.y - b.z - 50;
      if (sp > 600) { F.glow(e.x, hy, 80, HOT, 0.2 * k); if (Math.random() < dt * 36) F.emit({ x: e.x + rnd(-30, 30), y: hy + rnd(-40, 40), vx: -b.vx * 0.35 + rnd(-80, 80), vy: -b.vy * 0.25 + rnd(-60, 60), life: 0.18, s0: 3, s1: 1, c: WHITE, a: 0.55, stretch: 0.04, cell: C.Glow }); }
      // 音爆圈：飞得够快，每隔一小段在身后炸开一圈竖着的环
      if (sp > 1300) {
        const nt = (boomT.get(b) ?? 0) - dt;
        if (nt <= 0) {
          boomT.set(b, 0.12);
          const a = Math.atan2(b.vy, b.vx);
          F.emit({ x: e.x - Math.cos(a) * 40, y: hy - Math.sin(a) * 30, life: 0.26, s0: 30, s1: 120, c: mixc(HOT, WHITE, 0.5), a: 0.6, cell: C.Ring, rot: a });
          F.shock(e.x, hy, 140, 8, 0.25);
        } else boomT.set(b, nt);
      }
      // 贴地犁行：一路扬尘、地上留浅沟（水面上的由 'wake' 事件画）
      if (b.grounded && sp > 220) {
        if (Math.random() < dt * 40) F.emit({ x: e.x + rnd(-14, 14), y: e.y - 6, vx: -b.vx * 0.15 + rnd(-60, 60), vy: rnd(-90, -30), life: rnd(0.5, 0.9), s0: rnd(18, 28), s1: 60, c: DUST, a: 0.3, add: 0, cell: smokeCell(), drag: 2.5, rot: Math.random() * TAU });
        const E = e as typeof e & { _furrow?: number }; E._furrow = (E._furrow ?? 0) - dt;
        if (E._furrow <= 0) { E._furrow = 0.06; decal(K.Brush0, e.x, e.y, 26, 34, 5, [0.1, 0.08, 0.06], 0.45, { add: 0, sq: 0.5, rot: Math.atan2(b.vy, b.vx), ease: 4, fin: 0.02 }); }
      }
    }
  }
  F.B.billboard = null;
  // 妖兽的残影（人形的由 combatfx 按人画）
  for (const gh of B.ghosts) {
    if (!gh.e || gh.e.cs) continue;
    const k = 1 - gh.t / gh.dur, sz = 60 * (gh.e.def.look?.size ?? 1);
    F.B.billboard = { x: gh.x, y: gh.y };
    F.glow(gh.x, gh.y - gh.z - sz * 0.6, sz, col(gh.color), 0.22 * k);
    F.glow(gh.x, gh.y - gh.z - sz * 0.6, sz * 0.45, WHITE, 0.16 * k);
  }
  F.B.billboard = null;
  // 主角：欺身的光带 / 被打飞的尾迹
  if (B.pTrail.length > 1) {
    F.B.billboard = { x: p.x, y: p.y };
    streak(F, B.pTrail as FlightPoint[], B.pb.air ? [0.7, 0.85, 1] : [1, 0.92, 0.7], 1.1, B.pb.air ? 0.9 : 1.2);
    if (!B.pb.air) { F.glow(p.x, p.y - p.st.lift - 50, 90, [1, 0.9, 0.65], 0.24); if (Math.random() < dt * 50) F.emit({ x: p.x + rnd(-40, 40), y: p.y - p.st.lift - rnd(0, 100), vx: rnd(-60, 60), vy: rnd(-60, 60), life: 0.16, s0: 4, s1: 1, c: WHITE, a: 0.6, cell: C.Glow }); }
    F.B.billboard = null;
  }
  // 拼招：脚下一圈压下去的气场（慢慢转的地环 + 暗心）、两拳之间噼啪的电弧和火星
  const S = B.clash.st;
  if (S && S.phase !== 'result') {
    const gold: RGB = [1, 0.84, 0.45], pulse = 0.85 + 0.15 * Math.sin(t * 26);
    F.ground(C.RingSoft, S.x, S.y, 260 * pulse, t * 2, S.water ? FOAM : gold, 0.2, 1, 0.5);
    F.ground(C.Ring, S.x, S.y, 200 + 30 * Math.sin(t * 9), -t * 3, S.water ? SEA : gold, 0.5, 1, 0.5);
    F.ground(C.Disc, S.x, S.y, 170, 0, S.water ? DEEP : [0.06, 0.05, 0.04], S.water ? 0.45 : 0.35, 0, 0.5);
    F.B.billboard = { x: S.x, y: S.y };
    const hy = S.y - 46 - 62;
    F.glow(S.x, hy, 34 * pulse, gold, 0.18);   // 两拳之间一点光（压小：人要看得清）
    // 第三轮：两股气劲相持——你这边金、对方那边赤紫，各从自己身上往中间涌，在两拳之间顶住（中线跟着谁占上风微微偏）
    {
      const RED: RGB = [0.95, 0.3, 0.55], lean = Math.sin(t * 3.1) * 14;
      for (let i = 0; i < 4; i++) {
        const ph = (t * 2.2 + i / 4) % 1, w = 70 * (1 - ph * 0.5);
        F.glow(S.x - 150 + ph * (140 + lean), hy + Math.sin(i * 2.3 + t * 7) * 10, w, gold, 0.16 * (1 - ph * 0.3));
        F.glow(S.x + 150 - ph * (140 - lean), hy + Math.cos(i * 1.7 + t * 6) * 10, w, RED, 0.16 * (1 - ph * 0.3));
      }
      F.beam(S.x - 170, hy, S.x + lean, hy, 26, gold, 0.28); F.beam(S.x + 170, hy, S.x + lean, hy, 26, RED, 0.28);
      F.sprite(C.Ring, S.x + lean, hy, 60, 130, 0, [1, 0.95, 0.85], 0.35 * pulse, 1);
    }
    F.glow(S.x, hy, 10, WHITE, 0.4);
    if (Math.random() < dt * 40) F.bolt(S.x - 60, hy + rnd(-20, 20), S.x + 60, hy + rnd(-20, 20), Math.random() * 1000, 18, 3, mixc(gold, WHITE, 0.5), 0.8, 8, false);
    if (Math.random() < dt * 60) { const a = Math.random() * TAU; F.emit({ x: S.x, y: hy, vx: Math.cos(a) * rnd(300, 700), vy: Math.sin(a) * rnd(200, 500), life: rnd(0.15, 0.3), s0: 3, s1: 1, c: gold, a: 0.9, stretch: 0.03, cell: C.Glow }); }
    if (S.water && Math.random() < dt * 30) F.emit({ x: S.x + rnd(-200, 200), y: S.y - 4, vx: 0, vy: -rnd(200, 420), life: rnd(0.4, 0.7), s0: 4, s1: 2, c: FOAM, a: 0.8, grav: 1300, cell: C.Glow });
    F.B.billboard = null;
  }
  // 架势：脚下一圈慢转的淡金光环（只是提示自己在架势里，很淡）
  if (B.stance) {
    const r = 64 + Math.sin(t * 3) * 3;
    F.ground(C.Ring, p.x, p.y + 2, r, t * 0.6, [1, 0.82, 0.5], 0.32, 1, 0.5);
    F.ground(C.RingSoft, p.x, p.y + 2, r * 1.08, 0, [1, 0.7, 0.35], 0.16, 1, 0.5);
  }
  // r7 重击定向：按住右键时对手身上的箭头、沿途要撞上的东西、落点圈；平时锁定着破了罡的对手，脚下一根淡箭头
  const av = B.aimView();
  if (av) drawAim(F, av, t);
  // 兵器：刀光剑影、飞着的剑气
  drawBlades(F, c);
}

/** 上挑青、平飞金、下砸赤；打不飞（罡气没破）灰 */
const AIM_COL: Record<string, RGB> = { '1': [0.55, 0.88, 1], '0': [1, 0.8, 0.42], '-1': [1, 0.42, 0.28], no: [0.72, 0.72, 0.72] };
/** 一段立体的带子（点是 x、y、离地高度）：暗底一层压住背景（普通混合）、亮色一层；a(i) 管每个点的透明度 */
function band(F: FxSys, P: readonly (readonly [number, number, number])[], w: number, cc: RGB, a: (u: number) => number, under = true) {
  const n = P.length; if (n < 2) return;
  const flat = new Float32Array(n * 2), off = new Float32Array(n);
  for (let i = 0; i < n; i++) { flat[i * 2] = P[i][0]; flat[i * 2 + 1] = P[i][1]; off[i] = -P[i][2] - 46 * Math.min(1, P[i][2] / 40); }   // 贴地的（z = 0）就贴地画，离了地的画在身子中间那么高
  const prev = F.B.billboard; F.B.billboard = null;
  if (under) F.B.strip(C.Beam, flat, n, () => w * 2, (i) => 0.32 * a(i / (n - 1)), 0.08, 0.06, 0.05, 0, off);
  F.B.strip(C.Beam, flat, n, () => w, (i) => 0.75 * a(i / (n - 1)), cc[0], cc[1], cc[2], 1, off);
  F.B.strip(C.Beam, flat, n, () => w * 0.3, (i) => a(i / (n - 1)), 0.5 + cc[0] * 0.5, 0.5 + cc[1] * 0.5, 0.5 + cc[2] * 0.5, 1, off);   // 亮芯
  F.B.billboard = prev;
}
/** 箭头尖：从路径的最后一点往回量 L，两边各张开一翼（翼在水平方向张开，竖着砸的箭头也看得出） */
function head(F: FxSys, P: readonly (readonly [number, number, number])[], L: number, W: number, ux: number, uy: number, cc: RGB, a: number, lw = 26) {
  const n = P.length; if (n < 2) return;
  const T = P[n - 1];
  let i = n - 2, acc = 0;
  for (; i > 0; i--) { acc += Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1], P[i + 1][2] - P[i][2]); if (acc >= L) break; }
  const Q = P[Math.max(0, i)], k = Math.min(1, L / Math.max(1, Math.hypot(T[0] - Q[0], T[1] - Q[1], T[2] - Q[2])));
  const bx = T[0] + (Q[0] - T[0]) * k, by = T[1] + (Q[1] - T[1]) * k, bz = T[2] + (Q[2] - T[2]) * k;
  // 翼往哪边张：箭杆基本是竖的（上挑的起头、下砸）就沿屏幕横向张开，不然按水平方向的垂线（俯视里沿纵深张开的翼会叠在箭杆上看不见）
  const hx = T[0] - bx, hy = T[1] - by, hl = Math.hypot(hx, hy), vert = hl < Math.abs(T[2] - bz) * 0.6;
  const nx = vert ? 1 : -(hl > 1 ? hy / hl : uy), ny = vert ? 0 : (hl > 1 ? hx / hl : ux);
  const wing: [number, number, number][] = [[bx + nx * W, by + ny * W * 0.82, bz], [T[0], T[1], T[2]], [bx - nx * W, by - ny * W * 0.82, bz]];
  band(F, wing, lw, cc, () => a, true);
}
/** 把一条立体路径按长度切成两段：前 L 长的一段、余下的（两段在切点相接） */
function split(P: readonly (readonly [number, number, number])[], L: number): [[number, number, number][], [number, number, number][]] {
  const A: [number, number, number][] = [[P[0][0], P[0][1], P[0][2]]];
  let acc = 0;
  for (let i = 1; i < P.length; i++) {
    const a = P[i - 1], b = P[i], d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    if (acc + d >= L) {
      const u = (L - acc) / Math.max(1e-6, d), m: [number, number, number] = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
      A.push(m);
      return [A, [m, ...P.slice(i).map((q) => [q[0], q[1], q[2]] as [number, number, number])]];
    }
    acc += d; A.push([b[0], b[1], b[2]]);
  }
  return [A, []];
}
function drawAim(F: FxSys, av: AimView, t: number) {
  const cc = av.ok ? AIM_COL[String(av.v)] : AIM_COL.no, e = av.e;
  const prev = F.B.billboard; F.B.billboard = null;
  if (!av.full) {
    // 平时：脚下一根淡箭头（贴地的平飞、翘起来的上挑、从头顶往下扎的下砸），压得很淡，不挡人
    const ux = av.ux, uy = av.uy, s0 = 54, s1 = 230;
    const P: [number, number, number][] = [];
    for (let i = 0; i <= 6; i++) {
      const u = i / 6, d = s0 + (s1 - s0) * u;
      if (av.v === 1) P.push([e.x + ux * d, e.y + uy * d * 0.82, 4 + 150 * u * u]);
      else if (av.v === -1) P.push([e.x + ux * (s0 + 30 * u), e.y + uy * (s0 + 30 * u) * 0.82, 230 * (1 - u) + 2]);
      else P.push([e.x + ux * d, e.y + uy * d * 0.82, 0]);
    }
    const pulse = 0.85 + 0.15 * Math.sin(t * 4);
    band(F, P, 26, cc, (u) => (0.1 + 0.26 * u) * pulse, false);
    head(F, P, 70, 44, ux, uy, cc, 0.36 * pulse, 22);
    if (av.v === -1) F.ground(C.Ring, e.x + ux * (s0 + 30), e.y + uy * (s0 + 30) * 0.82, 70, 0, cc, 0.18 * pulse, 1, 0.5);
    F.B.billboard = prev;
    return;
  }
  // 按住：对手身上一根粗箭头（沿飞行路径的头一段，上挑的翘起、下砸的往下扎）；后面一条细线连到落点圈；沿途会撞上的东西一圈红光
  const P = av.pts;
  const k = 0.75 + 0.25 * Math.sin(t * 7);
  const [A, rest] = split(P, av.v === -1 ? 9999 : 460);
  if (rest.length > 1) band(F, rest, 14, cc, () => (av.ok ? 0.55 : 0.3), false);
  band(F, A, av.ok ? 56 : 30, cc, (u) => Math.min(0.95, 0.15 + u * 1.6) * (av.ok ? 1 : 0.55), true);
  head(F, A, av.v === -1 ? 150 : 170, av.v === -1 ? 80 : 95, av.ux, av.uy, cc, av.ok ? 1 : 0.55, 40);
  if (av.ok && av.v === 1) {
    // 上挑：顶上一圈小环（滞空在这里），下面一根细垂线连到地上，看得出有多高
    let top = P[0]; for (const q of P) if (q[2] > top[2]) top = q;
    band(F, [[top[0], top[1], top[2]], [top[0], top[1], 1]], 3, cc, () => 0.22, false);
    F.ground(C.Ring, top[0], top[1], 46, 0, cc, 0.35, 1, 0.5);
  }
  const HIT: RGB = [1, 0.36, 0.26];
  for (const h of av.hits) {
    const r = h.k === 'wall' ? 60 : h.r * 1.25 + 18;
    F.ground(C.Ring, h.x, h.y, r * (0.96 + 0.06 * k), t * 1.5, HIT, 0.55 * k, 1, 0.5);
    F.ground(C.RingSoft, h.x, h.y, r * 1.18, 0, HIT, 0.22 * k, 1, 0.5);
  }
  const L = av.land;
  if (L && av.ok) {
    const R = av.v === -1 ? 190 : av.v === 1 ? 120 : 95, lc: RGB = L.water ? [0.6, 0.86, 1] : cc;
    F.ground(C.Disc, L.x, L.y, R * 0.9, 0, [0.06, 0.05, 0.04], 0.22, 0, 0.5);
    F.ground(C.Ring, L.x, L.y, R * (0.94 + 0.06 * k), -t * 1.2, lc, 0.6, 1, 0.5);
    F.ground(C.RingSoft, L.x, L.y, R * 0.6, 0, lc, 0.25 * k, 1, 0.5);
  }
  F.B.billboard = prev;
}

/** 后期的速度线：欺身、自己被打飞、被轰飞的人从身边掠过时，借遁空那道径向拉丝（强度压低，人物周围一圈保持清楚） */
export function brawlWarp(game: Game, hd: { heightAt(x: number, y: number): number; boost: number; projectAbsolute(x: number, y: number, h: number): { x: number; y: number } } | null) {
  const B = game.combat.brawl;
  if (!hd || B.warpK < 0.01) return undefined;
  const p = game.player;
  const top = hd.heightAt(p.x, p.y) + (p.st.lift + 46) * hd.boost;
  const at = hd.projectAbsolute(p.x, p.y, top), ahead = hd.projectAbsolute(p.x + B.warpDx * 400, p.y + B.warpDy * 400, top);
  const dx = ahead.x - at.x, dy = ahead.y - at.y, dl = Math.hypot(dx, dy) || 1;
  return { k: B.warpK, burst: 0, spool: 0, t: game.time, x: at.x, y: at.y, dx: dx / dl, dy: dy / dl, color: [1, 0.86, 0.6] as const };
}
