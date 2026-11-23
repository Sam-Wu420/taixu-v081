// 噬魂魔尊 · 夜无赦：招式共用的小工具、可调的数、招表登记（首领本体在 world/yewushe.ts，招式在 yws-moves1/2/3.ts）。
//
// 规矩（和撼山客那几批一样）：
//   · 伤害一律走 MoveCtx.hit（hitEnemy / hitPlayer / npcHit）；他出手按对手气血的几成算（strike 的 frac），你学会的版本按近战攻力的倍数（pk）；
//   · 招式路径（begin / tick / end / can）上一个 Math.random 都不取：要抖动用 hash32（world/brawlrng.ts）；
//   · 每招自己一份钟（c.data.T）：命中顿帧时停住；形态（人身 / 半魔 / 魔躯）在起手那一刻定下，招里读 D(c).form；
//   · 画面只往 fx3d（立体特效）、hsp2 的 scr / show（整屏压暗、变色、大字、横贯光线）、impactfx（白闪、书法大字）报——不碰 three。
import type { Enemy } from './combat';
import { realmTakeK } from './combat';
import type { Game } from './game';
import type { MoveCtx, SpecialMove } from './brawlmoves';
import { registerMove } from './brawlmoves';
import { fx3dOf, type RGB3 } from './fx3d';
import { hsp2Of, type HsP2 } from './hsp2';
import { heavyHit, pushGhost } from './hsmoves3';
import { hash32 } from './brawlrng';
import { audio, type YwsSfx } from './audio';
import type { Action } from '../gfx/character';
import type { Yewushe } from './yewushe';
import { poseAt, ywsMoveLen, ywsHits, ywsHasForm } from './yewushe-anim';   // 画面线的帧表（只读）：招式的时长、出手时刻、位移都按它

export const TAU = Math.PI * 2;
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const smooth = (k: number) => { const t = clamp(k, 0, 1); return t * t * (3 - 2 * t); };

/** 三种形态：人身、半魔、末劫魔身（魔躯） */
export type YwsForm = 'human' | 'half' | 'demon';
export const FORMS: readonly YwsForm[] = ['human', 'half', 'demon'];
export const FORM_NAME: Record<YwsForm, string> = { human: '人身', half: '半魔', demon: '末劫魔身' };

// ------------------------------------------------------------------ 可调的数
export const YWS = {
  /** 降临间隔（游戏日）：元婴以前 / 元婴以后；降临前多少天出传闻；不打多少天离开；打败后多少天不再来 */
  gap: [200, 320] as [number, number], gapYy: [120, 200] as [number, number],
  rumorLead: 30, stay: 40, rest: 1000,
  /** 开局以后第一次最早在第几天（太早来了没法打） */
  first: [160, 260] as [number, number],
  /** 走近多远生成真身、走远多远收起；多近开打；追出多远算脱战（脱战多少息回到降临处、回满） */
  spawnR: 8000, despawnR: 9500, aggroR: 1700, leashR: 4200, leashT: 6,
  /** 形态：气血几成进半魔、几成进魔躯 */
  halfAt: 0.7, demonAt: 0.4,
  /** 觉醒大招：一场最多几次、两次之间至少隔多少息 */
  bigMax: 2, bigGap: 22,
  /** 气血倍率（比同境界的修士厚这么多）、攻力倍率 */
  hpK: 9, atkK: 1.25,
  /** 每形态招式伤害乘多少（按对手气血的比例，再乘这个） */
  formK: { human: 1, half: 1.15, demon: 1.35 } as Record<YwsForm, number>,
  /** 魔影随身：每次出手追加魔影追打的几率（按形态）、追打晚多少息、打多重 */
  shadowCh: { human: 0.3, half: 0.45, demon: 0.6 } as Record<YwsForm, number>, shadowDelay: 0.28, shadowFrac: 0.025,
  /** 立板（贴图）高：人身 / 半魔 / 魔躯（世界单位；后期留色遮罩、锁定血条按它取高） */
  height: { human: 235, half: 250, demon: 620 } as Record<YwsForm, number>,   // 和画面线帧表的 YWS_FORM_H 一致（魔躯三个半人高）
} as const;

/** 他一套招里登记的那些（id → 招）：每批文件 import 进来时调 addYws 登记，首领的出招表从这里取 */
export const YWS_MOVES = new Map<string, SpecialMove & { forms: readonly YwsForm[]; big?: boolean; far?: boolean; cine?: boolean }>();
/** 登记一招：注册进近战的特殊招式表，并记下他哪几个形态会放、是不是觉醒大招 / 远招 */
export function addYws(m: SpecialMove, o: { forms: readonly YwsForm[]; big?: boolean; far?: boolean; cine?: boolean }) {
  const def = Object.assign(m, o);
  YWS_MOVES.set(m.id, def);
  registerMove(def);
  return def;
}

// ------------------------------------------------------------------ 招式里用的
export const ywsOf = (B: MoveCtx['B']): Yewushe | undefined => (B.g as Game & { yewushe?: Yewushe }).yewushe;
export const isYws = (B: MoveCtx['B'], u: Enemy | null) => !!u && u === ywsOf(B)?.ent;
export const posOf = (c: MoveCtx, who: Enemy | 'p' | null) => { const p = c.B.g.player; return who === 'p' ? { x: p.x, y: p.y, z: p.z + c.B.playerLift } : who ? { x: who.x, y: who.y, z: who.z } : null; };
export const userPos = (c: MoveCtx) => { const p = c.B.g.player; return c.user ? { x: c.user.x, y: c.user.y, z: c.user.z } : { x: p.x, y: p.y, z: p.z + c.B.playerLift }; };
export interface YD { T: number; hold: number; ux: number; uy: number; form: YwsForm; sc: number; seed: number; [k: string]: unknown }
export const D = (c: MoveCtx) => c.data as YD;
/** 招式自己的钟：命中顿帧（hold）时停住 */
export function clock(c: MoveCtx, dt: number): number { const d = D(c); if (d.hold > 0) d.hold -= dt; else d.T += dt; return d.T; }
/** 到了 t 这一刻（只返回一次） */
export function at(c: MoveCtx, k: string, t: number): boolean { const d = D(c); if (d.T >= t && !d[k]) { d[k] = 1; return true; } return false; }
/** 在 [a, b) 这一段里 */
export const within = (c: MoveCtx, a: number, b: number) => D(c).T >= a && D(c).T < b;
/** 起手：方向、钟、形态（你学会的版本当「人身」放）、画面大小（魔躯的招整体大一圈）、这一招的种子 */
export function init(c: MoveCtx) {
  const d = D(c); d.T = 0; d.hold = 0;
  const Y = ywsOf(c.B);
  d.form = c.user && isYws(c.B, c.user) && Y ? Y.form : 'human';
  d.sc = d.form === 'demon' ? 1.6 : d.form === 'half' ? 1.15 : 1;
  d.seed = hash32(Math.round(c.B.g.time * 1000), c.def.id.length, c.user ? c.user.id : 7);
  aim(c);
  if (Y && c.user === Y.ent) Y.onCast(c);
}
/** 重新朝对手 */
export function aim(c: MoveCtx) {
  const d = D(c), u = userPos(c), q = posOf(c, c.target);
  if (q) { const dx = q.x - u.x, dy = q.y - u.y, L = Math.hypot(dx, dy); d.ux = L > 1 ? dx / L : c.dirX; d.uy = L > 1 ? dy / L : c.dirY; } else { d.ux = c.dirX; d.uy = c.dirY; }
  face(c, d.ux, d.uy);
}
/** 稳定的「随机」：同一招同一个键每次一样（不碰 Math.random） */
export function hr(c: MoveCtx, ...k: number[]): number { return hash32(D(c).seed, ...k) / 4294967296; }
/** 摆一个动作（占位画法：人形的兵器动作；画面线的立板按 view() 取帧，不靠这个） */
export function pose(c: MoveCtx, a: Action, t?: number) {
  const cs = c.user ? c.user.cs : c.B.g.player.st; if (!cs) return;
  if (cs.action !== a) { if (c.user) { cs.restart(a); cs.blend = 0.65; } else (c.B as unknown as { playAct(a: Action, d: number): void }).playAct(a, 3); }
  if (t !== undefined) cs.actionT = t;
}
export function face(c: MoveCtx, dx: number, dy: number) {
  if (Math.abs(dx) + Math.abs(dy) < 1e-4) return;
  const cs = c.user ? c.user.cs : c.B.g.player.st; if (!cs) return;
  cs.faceToward(dx, dy, false); cs.yaw = cs.targetYaw;
  if (c.user) c.user.facing = dx >= 0 ? 1 : -1;
}
/** 他身上的 cs（shell 时没人推它） */
export const syncUser = (c: MoveCtx, dt: number) => { if (c.user) { const e = c.user; if (e.cs) { e.cs.x = e.x; e.cs.y = e.y; e.cs.lift = e.flyH + e.lift; if ((e as { shell?: boolean }).shell) e.cs.update(dt); } } };
/** 挪到 (x, y)，离地 z（落点先过一遍：不进水、不进城镇宗门） */
export function put(c: MoveCtx, x: number, y: number, z = 0) {
  const T = c.B.g.terrain, u = userPos(c);
  if (!(T.walkFactor(x, y) > 0) || !T.isLand(x, y) || c.B.g.combat.safeAt(x, y)) { if (z <= 0) return; x = u.x; y = u.y; }
  if (c.user) c.place(null, x, y, z); else c.place(null, x, y);
}
/** 对手在不在 (x, y) 的 r 以内（你在水里潜着、已经倒下的不算） */
export function near(c: MoveCtx, x: number, y: number, r: number, who: Enemy | 'p' | null = c.target): boolean {
  const q = posOf(c, who); return !!q && Math.hypot(q.x - x, q.y - y) < r && (who !== 'p' || (c.B.pSubT <= 0 && !c.B.g.hero.dead)) && (who === 'p' || !!who && !who.dead);
}
/** 按对手气血的几成折成「攻力倍数」（他出手：对手是你按你的气血，对手是人按它的气血） */
function rawFor(c: MoveCtx, user: Enemy, tg: Enemy | 'p', frac: number): number {
  const g = c.B.g;
  if (tg === 'p') { const ps = g.combat.pStats; return frac * ps.hp / realmTakeK(user.realm - g.hero.realm, g.hero.realm) + ps.def * 0.8; }
  return frac * tg.maxHp / (realmTakeK(clamp(user.realm - tg.realm, -3, 3), tg.realm) * 0.55) + tg.dfn * 0.8;
}
export interface HitOpt { power?: number; stop?: number; uz?: number; ux?: number; uy?: number; sfx?: YwsSfx | null; who?: Enemy | 'p' | null; noFx?: boolean }
/** 打一下：frac 按对手气血（他出手）/ pk 按攻力（你出手）；命中方向性特效、顿帧（两人一起停 stop 息，招式的钟也停） */
export function strike(c: MoveCtx, frac: number, pk: number, kind: string, o: HitOpt = {}): boolean {
  const tg = o.who === undefined ? c.target : o.who; if (!tg) return false;
  const d = D(c), Y = ywsOf(c.B);
  let ok: boolean;
  if (c.user) {
    const k = isYws(c.B, c.user) ? YWS.formK[d.form] * (Y?.dmgK ?? 1) : 1;
    ok = c.hit(tg, rawFor(c, c.user, tg, frac * k) / Math.max(1e-6, c.user.atk), kind);
  } else ok = tg === 'p' ? false : c.hit(tg, pk, kind);
  if (!o.noFx) heavyHit(c, tg, o.ux ?? d.ux, o.uy ?? d.uy, o.uz ?? 0, o.power ?? 1.1);
  const q = posOf(c, tg); if (q && o.sfx !== null) sfx(o.sfx ?? 'yws_hit', q.x, q.y);
  const stop = o.stop ?? 0.06; if (stop > 0) { c.freeze(stop); d.hold = Math.max(d.hold, stop); }
  Y?.log.push('hit-' + kind);
  return ok;
}
/**
 * 一片范围打击：圆心 (x, y)、半径 r 以内的对手都挨一下（他出手：你、你的同伴、旁边的人；你出手：附近的敌人）。
 * 主目标照 strike 走（顿帧、方向性特效），旁的只挨伤害和小的命中闪光。返回打中了几个
 */
export function aoe(c: MoveCtx, x: number, y: number, r: number, frac: number, pk: number, kind: string, o: HitOpt = {}): number {
  let n = 0;
  if (near(c, x, y, r)) { if (strike(c, frac, pk, kind, o)) n++; }
  const B = c.B, cb = B.g.combat;
  const list: (Enemy | 'p')[] = [];
  if (c.user) { for (const a of cb.allies) list.push(a); if (c.target !== 'p' && ywsOf(B)?.mode !== 'demo' && near(c, x, y, r, 'p')) list.push('p'); }   // 试玩演示：不打你
  else for (const e of cb.enemies) list.push(e);
  for (const w of list) {
    if (w === c.target || w === c.user || n > 8) continue;
    if (w !== 'p' && (w.dead || w.hideT > 0 || (w as { noP?: boolean }).noP)) continue;
    if (!near(c, x, y, r, w)) continue;
    const ok = c.user ? c.hit(w, rawFor(c, c.user, w, frac * 0.7 * YWS.formK[D(c).form]) / Math.max(1e-6, c.user.atk), kind) : c.hit(w, pk * 0.7, kind);
    if (ok) { n++; const q = posOf(c, w); if (q) fx3dOf(B.g).impact(q.x, q.y, q.z + 90, q.x - x, q.y - y, { power: 0.7, warp: 0 }); }
  }
  return n;
}
/** 整屏效果（只对他出招时：你学会的版本不压整屏） */
export const scr = (c: MoveCtx, o: Parameters<HsP2['scr']>[0]) => { if (c.user) hsp2Of(c.B.g).scr({ keep: [c.user, ...(c.target ? [c.target] : [])], fxKeep: true, ...o }); };   // r19 fxKeep：压暗、压黑只压场景，不压他的特效
/** 界面那一层：书法大字、横贯光线、横向速度线（只对他出招时） */
export const show = (c: MoveCtx, ev: Parameters<HsP2['show']>[0]) => { if (c.user) hsp2Of(c.B.g).show(ev); };
/** r19：镜头震动（克制）：一下最多抖到 trauma 0.6（后期 15·t² 像素 → 五像素上下；原来一招能叠到 1、十五像素），连着抖也不叠上去——不晃到玩家看不清自己。夜无赦不持续拉近、不推镜头；c.cam 只剩落地那一下很短的冲击 */
export const shake = (c: MoveCtx, k: number) => { const g = c.B.g, room = 0.6 - g.trauma; if (room > 0.01 && k > 0) c.shake(Math.min(room, k * 0.45)); };
export const white = (c: MoveCtx, f = 2) => { if (f <= 0) return; const I = c.B.impact; I.whiteF = Math.max(I.whiteF, f + 1); };   // f = 0：不闪白
/** 他喊一声（头顶的大字） */
export function say(c: MoveCtx, s: string, col = '#e9a0ff') {
  if (!c.user) return;
  const g = c.B.g, e = c.user;
  g.combat.texts.push({ anchor: { x: e.x, y: e.y, offsetY: -e.z }, x: e.x, y: e.y - (YWS.height[D(c).form] ?? 210) - 20, s, color: col, t: 0, vy: -14, big: true } as never);
}
export const F3 = (c: MoveCtx) => fx3dOf(c.B.g);
export const sfx = (k: YwsSfx, x?: number, y?: number) => audio.yws(k, x, y);
/** 残影（同时在场的有上限，见 hsmoves3.pushGhost） */
export const ghost = (c: MoveCtx, x: number, y: number, z: number, sx: number, sy: number, dur = 0.34, col = '150,60,190') => pushGhost(c, x, y, z, sx, sy, dur, col);

// ------------------------------------------------------------------ 配色（魔修：紫黑芯、血红边）
export const C_VOID: RGB3 = [0.75, 0.25, 1.1];
export const C_BLOOD: RGB3 = [1.5, 0.12, 0.16];
export const C_SOUL: RGB3 = [0.55, 0.9, 1.3];
export const C_HELL: RGB3 = [1.6, 0.35, 0.15];
/** 镰刀的刀光：甩出去的一段圆弧（中心 = 他身前、离地 z），立着（竖劈）或横着（横扫） */
export function slashArc(c: MoveCtx, o: { dir?: number; r?: number; w?: number; z?: number; sweep?: number; a0?: number; tilt?: number; dur?: number; col?: RGB3; power?: number; at?: { x: number; y: number }; vertical?: boolean; delay?: number }) {
  const d = D(c), u = o.at ?? userPos(c), F = F3(c), sc = d.sc;
  const ang = o.dir ?? Math.atan2(d.uy, d.ux), fx = Math.cos(ang), fy = Math.sin(ang);
  const R = (o.r ?? 170) * sc, z = (o.z ?? 100) * Math.sqrt(sc);
  if (o.vertical) {
    // 竖劈：圆面法线是身侧（水平、垂直于出手方向）；0 度朝上，扫向前下方
    F.scythe(u.x + fx * 40 * sc, u.y + fy * 40 * sc, z, { nx: -fy, ny: fx, nz: 0, e1: [0, 0, 1], a0: o.a0 ?? 0.3, sweep: o.sweep ?? -2.6, r: R, w: (o.w ?? 70) * sc, dur: o.dur ?? 0.42, col: o.col, power: o.power, delay: o.delay });
  } else {
    // 横扫：圆面贴地（带一点倾斜），0 度朝身后，扫过前方
    const t = o.tilt ?? 0.18;
    F.scythe(u.x, u.y, z, { nx: -fy * t, ny: fx * t, nz: 1, e1: [-fx, -fy, 0], a0: o.a0 ?? -0.4, sweep: o.sweep ?? 3.6, r: R, w: (o.w ?? 64) * sc, dur: o.dur ?? 0.4, col: o.col, power: o.power, delay: o.delay });
  }
}

// ------------------------------------------------------------------ 第一批以后加的小工具
/** 学得会的招（你打败他以后能放）：他、或者你 */
export const ywsOrYou = (B: MoveCtx['B'], u: Enemy | null) => !u || isYws(B, u);
/** 把对手拖到 (x, y)、离地 z（落点不能下水、进城镇宗门；不能拖就原地） */
export function drag(c: MoveCtx, who: Enemy | 'p' | null, x: number, y: number, z?: number) {
  if (!who) return;
  if (who !== 'p' && (who.dead || !c.B.launchable(who))) return;
  const T = c.B.g.terrain;
  if (!(T.walkFactor(x, y) > 0) || !T.isLand(x, y) || c.B.g.combat.safeAt(x, y)) return;
  c.place(who, x, y, z);
}
/** 起手那一刻他站的地方（招里画几何用：人在招里挪了，几何还按起手算） */
export function origin(c: MoveCtx): { x: number; y: number } { const d = D(c); if (d.ox === undefined) { const u = userPos(c); d.ox = u.x; d.oy = u.y; } return { x: d.ox as number, y: d.oy as number }; }
/** 沿出手方向 k 远（侧向 s）的那一点（从起手处量） */
export function ahead(c: MoveCtx, k: number, s = 0): { x: number; y: number } { const o = origin(c), d = D(c); return { x: o.x + d.ux * k - d.uy * s, y: o.y + d.uy * k + d.ux * s }; }
/** 对手的位置（找不到就是身前 200） */
export function tgPos(c: MoveCtx): { x: number; y: number; z: number } { const q = posOf(c, c.target); if (q) return q; const a = ahead(c, 200); return { x: a.x, y: a.y, z: 0 }; }
/** 在 [t0, t1) 里每隔 step 一次（返回第几次；这一帧没到就返回 -1）——招式里节拍性的刀光、连击用 */
export function every(c: MoveCtx, key: string, t0: number, t1: number, step: number): number {
  const d = D(c); if (d.T < t0 || d.T >= t1 + step * 0.5) return -1;
  const k = Math.min(Math.floor((d.T - t0) / step), Math.floor((t1 - t0) / step)), last = (d[key] as number | undefined) ?? -1;
  if (k <= last) return -1; d[key] = k; return k;
}
export const ang = (c: MoveCtx) => Math.atan2(D(c).uy, D(c).ux);
export const C_MAGENTA: RGB3 = [1.6, 0.25, 1.0];

// ------------------------------------------------------------------ 接画面线的帧表（world/yewushe-anim.ts 的 poseAt(animId, form, t毫秒)）
/** 我们的招 id → 画面线帧表里的招 id（规格书「招式 id 一览」）；同一招里换段的（空斩、落魂锤、劫光、裂影杀、魔呓、玄冥终焉、末劫狂想 / 陷阱……）由招式自己 setSub 报 */
export const ANIM_OF: Record<string, string> = {
  yws_duohun: 'duohun', yws_sanshi: 'pugong', yws_ruti: 'moqi', yws_jiangshen: 'tianmo', yws_guibu: 'guimen', yws_mozhua: 'shehun', yws_xuelian: 'xuelian',
  yws_liehun: 'liehun', yws_bengyue: 'bengyue', yws_huixuan: 'huixuan', yws_youming: 'youming', yws_jielun: 'jielun', yws_mingchu: 'mingchu', yws_moquan: 'moquan',
  yws_mozhang: 'benneng', yws_guimen: 'guimen', yws_moshen: 'moshen', yws_moxiao: 'mosiao', yws_tianqing: 'tianqing', yws_mieshi: 'mieshi',
  yws_shixian: 'shixian', yws_mochao: 'mochao', yws_moyi: 'moyi',
};
/** 这一招从这一刻起换成帧表里的另一段（view() 的 anim / animT 跟着换） */
export function setSub(c: MoveCtx, animId: string) { const d = D(c); d.sub = animId; d.subT0 = d.T ?? 0; }
/** 画面线要的帧表 id 和这一段放到第几毫秒（魔躯放魂镰三式 = 魔爪三连、魔拳 = 梦魇种） */
export function animOf(id: string, form: YwsForm, data: Record<string, unknown> | undefined): { anim: string | null; animT: number } {
  const d = (data ?? {}) as { sub?: string; subT0?: number; T?: number };
  let anim = d.sub ?? ANIM_OF[id] ?? null;
  if (!d.sub && form === 'demon') { if (id === 'yws_sanshi') anim = 'mo_pugong'; else if (id === 'yws_moquan') anim = 'menyan'; }
  return { anim, animT: Math.max(0, ((d.T ?? 0) - (d.sub ? d.subT0 ?? 0 : 0)) * 1000) };
}

// ------------------------------------------------------------------ 按帧表跑的招（对时版）
// 每招是帧表里一段或几段招（seq：['jielun', 'jieguang'] 这样），时长 = 各段 ywsMoveLen 之和；
// 出手 = 各段 ywsHits 的时刻（招式自己的钟，顿帧时停住）：到点调 hit(c, k)，伤害、特效、音效都在那一刻发，并记进 data.hitLog（测试核对）；
// 人挪到哪 = 段起点 + 帧表 poseAt 的 dx（朝出手方向）/ dy / lift——立板那边拿到的 view().x / y / z 已经含了位移，不要再加 poseAt 的 dx / lift。
export interface YwsHitK { anim: string; i: number; n: number; last: boolean; form: YwsForm; sc: number; seg: number }
export interface YwsDef {
  id: string; name: string; glyph: string; color: string; cd: number; range: number; desc: string;
  /** 你能学（打败他以后传）：境界、耗灵力 */
  learn?: { realm: number; mp: number };
  /** 这一形态放哪几段（帧表 id） */
  seq(c: MoveCtx, form: YwsForm): string[];
  start?(c: MoveCtx): void | boolean;
  /** 进到第 idx 段（帧表 id = anim） */
  enter?(c: MoveCtx, anim: string, idx: number): void;
  /** 每帧（lt = 这一段放到第几息） */
  frame?(c: MoveCtx, anim: string, lt: number, dt: number): void;
  /** 一下出手 */
  hit(c: MoveCtx, k: YwsHitK): void;
  end?(c: MoveCtx): void;
}
/** 帧表姿势 → 占位人形的动作（立板来了就不看这个） */
const ACT_OF: Record<string, Action> = {
  slash: 'heavyL1', claw: 'heavyL1', upper: 'heavyL3', sweep: 'heavyL2', spin: 'heavyL2', stab: 'heavyR', dash: 'heavyR', slam: 'heavyH', raise: 'heavyH', windup: 'heavyH', charge: 'heavyH',
  leap: 'heavyH', dive: 'heavyH', throw: 'heavyL2', catch: 'heavyL1', cast: 'cast', summon: 'cast', roar: 'shout', transform: 'shout', guard: 'cast', grab: 'cast', fist: 'punch', idle: 'idle',
  aw1_a: 'heavyH', aw1_b: 'heavyL1', aw1_c: 'heavyL2', fly: 'idle',
};
/** 这一招一共多长（息）、各段出手时刻（息，从招开始算）——测试、试玩用 */
export function ywsPlan(seq: string[], form: YwsForm): { total: number; hits: { anim: string; i: number; t: number }[] } {
  let t = 0; const hits: { anim: string; i: number; t: number }[] = [];
  for (const a of seq) { ywsHits(a, form).forEach((h, i) => hits.push({ anim: a, i, t: t + h / 1000 })); t += ywsMoveLen(a, form) / 1000; }
  return { total: t, hits };
}
export function ywsMove(def: YwsDef): SpecialMove {
  return {
    id: def.id, name: def.name, glyph: def.glyph, color: def.color, cd: def.cd, range: def.range, desc: def.desc,
    realm: def.learn?.realm, mp: def.learn?.mp, who: def.learn ? 'both' : 'npc', can: def.learn ? ywsOrYou : (B, u) => isYws(B, u),
    begin(c) {
      init(c); const d = D(c);
      const Y = ywsOf(c.B), forced = Y && c.user && c.user === Y.ent ? Y.forceSeq : null;   // 测试、试玩可以指定走哪几段（招里分支的变体）
      const seq = (forced ?? def.seq(c, d.form)).filter((a) => ywsHasForm(a, d.form)); if (!seq.length) return false;
      const st: number[] = []; let t = 0; for (const a of seq) { st.push(t); t += ywsMoveLen(a, d.form) / 1000; }
      d.seq = seq; d.starts = st; d.total = t; d.si = -1; d.fired = {}; d.hitLog = []; d.pseg = -1; d.sub = seq[0]; d.subT0 = 0;
      if (def.start?.(c) === false) return false;
    },
    tick(c, dt) {
      const T = clock(c, dt), d = D(c); syncUser(c, dt);
      const seq = d.seq as string[], st = d.starts as number[], fired = d.fired as Record<string, number>, log = d.hitLog as { anim: string; i: number; T: number; want: number }[];
      let si = 0; while (si + 1 < seq.length && T >= st[si + 1]) si++;
      for (let k = Math.max(0, d.si as number); k <= si; k++) {
        if (k !== d.si) {
          d.si = k; d.sub = seq[k]; d.subT0 = st[k];
          const u = userPos(c), q = posOf(c, c.target); d.sox = u.x; d.soy = u.y; d.dist = q ? Math.hypot(q.x - u.x, q.y - u.y) : 400;
          def.enter?.(c, seq[k], k);
        }
        const hs = ywsHits(seq[k], d.form);
        for (let i = 0; i < hs.length; i++) {
          const want = st[k] + hs[i] / 1000, key = k + ':' + i;
          if (T >= want - 1e-9 && !fired[key]) { fired[key] = 1; log.push({ anim: seq[k], i, T, want }); def.hit(c, { anim: seq[k], i, n: hs.length, last: i === hs.length - 1, form: d.form, sc: d.sc, seg: k }); }
        }
      }
      const anim = seq[si], lt = T - st[si];
      const P = poseAt(anim, d.form, lt * 1000, { dist: d.dist as number });
      if (P.seg !== d.pseg || si !== d.psi) { d.pseg = P.seg; d.psi = si; pose(c, ACT_OF[P.frame.replace(/^yws_[hbm]_/, '')] ?? 'idle', 0); }
      put(c, (d.sox as number) + d.ux * P.dx, (d.soy as number) + d.uy * P.dx + P.dy, Math.max(0, P.lift));
      def.frame?.(c, anim, lt, dt);
      return T < (d.total as number);
    },
    end(c) { try { def.end?.(c); } finally { const u = userPos(c); if (c.user && u.z > 0) put(c, u.x, u.y, 0); } },
  };
}
/** 他身前 k 远（此刻站的地方量） */
export function fwd(c: MoveCtx, k: number, s = 0): { x: number; y: number } { const u = userPos(c), d = D(c); return { x: u.x + d.ux * k - d.uy * s, y: u.y + d.uy * k + d.ux * s }; }
/** 一条长条判定（从 (x0, y0) 沿出手方向 a–b 远、半宽 w）：对手在不在里面 */
export function inStrip(c: MoveCtx, x0: number, y0: number, a: number, b: number, w: number, who: Enemy | 'p' | null = c.target): boolean {
  const q = posOf(c, who); if (!q || !near(c, q.x, q.y, 1e9, who)) return false; const d = D(c), dx = q.x - x0, dy = q.y - y0, al = dx * d.ux + dy * d.uy, sd = Math.abs(-dx * d.uy + dy * d.ux);
  return al >= a && al <= b && sd <= w;
}
