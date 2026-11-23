// 撼山客 · 岳千钧的招式·第二批：连击五招 + 擒拿四招（设计定稿：docs/撼山客与破坏系统-设计.md 第四节）。
//
//   连击：流星百裂 liuxing、燕回 yanhui、十方弹 shifang、天地往返 tiandi、点穴延爆 dianxue
//   擒拿：犁地 lidi、抡人为棍 lunren、陨星坠 yunxing、掷山 zhishan
//
// 每招都是 brawlmoves.registerMove 的一份 SpecialMove（begin → 每帧 tick → end），伤害一律走 MoveCtx.hit
// （主角打人 hitEnemy、他打你 hitPlayer、他打妖兽 npcHit），击飞走框架的 launch，破坏走 combat.wreck（只管破坏、不伤人）。
// 招式期间被打的人由这里接管位置（运动学：按时间插值摆到哪就在哪），收场时放回近战物理（launch）或原地硬直。
//   · 被接管的敌人：它的近战身体挂上这一招（body.move = 这一招）——寻常 AI、近战 AI、击飞物理都跳过它，画面照常跟着走；
//   · 被接管的你：每帧定身（holdPlayer）+ 一小会儿的眩晕（不能放法术、不能出招），只有方向键 / 闪避键 / 点屏幕用来挣脱（擒拿才有）。
// 谁能用：九招撼山客都会（can = 只有他本人）；燕回、十方弹、犁地主角学得会（他在切磋后教；试玩 try=brawl&learn=hs2 直接会）。
// 首领、体型巨大的妖兽、模组接管的单位（shell）抓不动：擒拿类对它们不出手（他换别的招；你放犁地给一句提示、不扣灵力）。
// 固定种子：招式路径上不碰 Math.random（落点、高低错落用 hash32 按坐标取；他挑招用近战自己的序列 brnd）。
//
// 共用的打击表现（黑白闪、背后冲击波、超高速追击线、定格特写、踏空气环）第一批在做（impactfx / impactgl）；
// 这里先用很小的本地版本（下面 IMPACT 一节），每个调用处标了 `// IMPACT:`，合并时换成第一批的。
import type { Enemy } from './combat';
import type { BrawlSys, Ghost } from './brawl';
import type { MoveRun } from './brawlmoverun';
import type { Hanshan } from './hanshan';
import type { Action } from '../gfx/character';
import { registerMove, MOVES, learnMove, moveArtId, type MoveCtx, type SpecialMove } from './brawlmoves';
import { isBoss } from './foeskills';
import { brnd, hash32 } from './brawlrng';
import { audio } from './audio';
import { hs2fx, hs2add, type Hs2Who, type Hs2Drag, type Hs2Barrage, type Hs2Fall, type Hs2Spin } from './hsmoves2fx';
import type { Hero } from './cultivation';
import { P1T } from '../gfx/character';
import { p1 } from './p1fx';
import { sideCam, sideSpot, screenRight, arcPts, byHs } from './hsmovesp1';   // r8-p1：流星百裂、燕回、十方弹换成参考视频的动作

type W = Enemy | 'p';
const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const easeOut = (t: number) => { t = clamp(t, 0, 1); return 1 - (1 - t) * (1 - t); };
const easeIn = (t: number) => { t = clamp(t, 0, 1); return t * t; };

// ------------------------------------------------------------------ 数值
/** 每一下的攻力倍数（他：按切磋 / 打妖兽时 pace 压过的攻力；你：近战攻力）。p* 是主角学会后的那一份 */
export const HS2K = {
  liuxing: { tick: 0.12, fin: 1.0 },
  yanhui: { pass: 0.42, fin: 0.9, pPass: 0.5, pFin: 1.1 },
  shifang: { bounce: 0.35, fin: 1.2, pBounce: 0.42, pFin: 1.5 },
  tiandi: { hit: 0.3, fin: 1.0 },
  dianxue: { poke: 0.05, pop: 0.3, fin: 0.8 },
  lidi: { slam: 0.5, grind: 0.08, rock: 0.25, fin: 0.7, pSlam: 0.6, pGrind: 0.1, pRock: 0.3, pFin: 0.9 },
  lunren: { grab: 0.2, bash: 0.6, self: 0.2, fin: 0.6 },
  yunxing: { grab: 0.2, fin: 1.6 },
  zhishan: { fin: 1.4 },
} as const;
/** 主角学得会的三招（HS_MOVES 里的 id 一样） */
export const HS2_LEARN = ['yanhui', 'shifang', 'lidi'] as const;
/** 这一批的九招（试玩入口、测试、他挑招用）：权重、距离窗口 */
export const HS2_MOVES: { id: string; name: string; w: number; min: number; max: number; grab?: boolean }[] = [
  { id: 'liuxing', name: '流星百裂', w: 1.2, min: 0, max: 420 },
  { id: 'yanhui', name: '燕回', w: 1, min: 0, max: 520 },
  { id: 'shifang', name: '十方弹', w: 1, min: 0, max: 480 },
  { id: 'tiandi', name: '天地往返', w: 0.9, min: 0, max: 420 },
  { id: 'dianxue', name: '点穴延爆', w: 0.7, min: 0, max: 380 },
  { id: 'lidi', name: '犁地', w: 1.3, min: 0, max: 460, grab: true },
  { id: 'lunren', name: '抡人为棍', w: 0.8, min: 0, max: 380, grab: true },
  { id: 'yunxing', name: '陨星坠', w: 0.8, min: 0, max: 380, grab: true },
  { id: 'zhishan', name: '掷山', w: 0.7, min: 380, max: 1500 },
];
const NAME: Record<string, string> = Object.fromEntries(HS2_MOVES.map((m) => [m.id, m.name]));

/** 挣脱：每按一下涨多少（犁地九下左右，陨星坠六下） */
const ESC_STEP: Record<string, number> = { lidi: 0.115, lunren: 0.14, yunxing: 0.17 };

// ------------------------------------------------------------------ 人与位置
let HS: Hanshan | null = null;
const gOf = (c: MoveCtx) => c.B.g;
const uW = (c: MoveCtx): W => c.user ?? 'p';
const isPU = (c: MoveCtx) => c.user === null;
interface P3 { x: number; y: number; z: number }
/** 某人此刻在哪（z：离地高度；你被接管时是这里给的那份高度） */
function pos(c: MoveCtx, w: W): P3 {
  const g = gOf(c);
  if (w === 'p') { const p = g.player; return { x: p.x, y: p.y, z: g.isFlying ? p.z : (c.data.pz as number | undefined) ?? c.B.playerLift }; }
  return { x: w.x, y: w.y, z: w.flyH + w.lift };
}
/** 一个人站得住的地方（秘境走秘境的；虚空斗法处处可站） */
function walkable(c: MoveCtx, x: number, y: number): boolean {
  const g = gOf(c);
  if (g.xukong?.fight?.on) return true;
  if (g.mijing?.active) return g.mijing.walk(x, y);
  return g.terrain.isLand(x, y) && g.terrain.walkFactor(x, y) > 0 && !g.space.blocked(x, y) && !g.combat.safeAt(x, y);
}
function passable(c: MoveCtx, ax: number, ay: number, bx: number, by: number): boolean {
  const g = gOf(c);
  if (!walkable(c, bx, by)) return false;
  if (g.xukong?.fight?.on || g.mijing?.active) return true;
  return g.terrain.canTraverse(ax, ay, bx, by);
}
/** 擒拿抓不抓得动：首领、巨兽、海里的妖物、模组接管的（shell）、定身 / 镇压中的都不抓 */
export function grabbable(B: BrawlSys, w: W | null): boolean {
  if (!w) return false;
  if (w === 'p') return !B.g.hero.dead && B.pSubT <= 0 && !B.clash.st;
  if (!B.launchable(w) || isBoss(w) || w.sea || (w as { shell?: boolean }).shell) return false;
  if (w.def.kind !== 'human' && (w.def.look?.size ?? 1) > 1.6) return false;
  return true;
}

/** 接管一个被打的人（不是出招者）：它的近战身体挂上这一招 / 你被定住 */
function seize(c: MoveCtx, w: W): boolean {
  const B = c.B, g = gOf(c), held = (c.data.held ??= new Set<W>()) as Set<W>;
  if (held.has(w)) return true;
  if (w === 'p') {
    if (g.hero.dead || B.pSubT > 0) return false;
    const pb = B.pb; pb.air = false; pb.vx = pb.vy = pb.vz = 0; pb.z = 0; pb.slam = false; pb.meteor = 0;
    if (g.isFlying) { g.player.flying = false; g.player.z = 0; g.player.zTarget = 0; }
    c.data.pz = 0;
  } else {
    if (!B.launchable(w)) return false;
    B.clear(w);
    const b = B.body(w); b.move = c as MoveRun; b.staggerT = 0; b.freezeT = 0;
    if (b.ai) { b.ai.st = 'idle'; b.ai.wind = 0; }
    if (w.cast) B.combat.foe.interrupt(w);
    w.windup = 0; w.kx = w.ky = 0;
    B.track(w);
  }
  held.add(w);
  holdP(c);
  return true;
}
/** 放开（不动位置；之后要么 launch 出去，要么 ground 落地） */
function release(c: MoveCtx, w: W) {
  const held = c.data.held as Set<W> | undefined; if (!held?.has(w)) return;
  held.delete(w);
  // r12-anim：放开时把这一招给你摆的被擒拿姿势（被按着拖、被抡、倒栽、空中挨打）一并收掉——原先只清了记号，
  // 近战那边的动作覆盖还剩二三十息，放开后走路、跑都还是躺着 / 悬空 / 站着的姿势在地上滑
  if (w === 'p') { c.data.pz = 0; c.B.playerLift = 0; if (c.data.pAct) { c.B.dropAct(c.data.pAct as Action); c.data.pAct = ''; c.data.act_p = ''; } }
  else { const b = c.B.peek(w); if (b && b.move === (c as MoveRun)) b.move = undefined; }
}
const held = (c: MoveCtx, w: W) => !!(c.data.held as Set<W> | undefined)?.has(w);
/** 你被接管着：这一帧定住、不能出招 / 放法术（闪避也压住：不然连按闪避就有无敌帧） */
function holdP(c: MoveCtx) {
  if (!held(c, 'p')) return;
  const cb = c.B.combat as unknown as { pst: { stun?: { t: number; dps: number } }; dodgeCd: number; dash: unknown };
  c.B.holdPlayer(0.15, true);
  if (!cb.pst.stun || cb.pst.stun.t < 0.15) cb.pst.stun = { t: 0.15, dps: 0 };
  cb.dodgeCd = Math.max(cb.dodgeCd, 0.2); cb.dash = null;
}
/** 摆位置（z 离地高度）；你：地上的高度走近战的「离地」那一份（画面每帧读） */
function put(c: MoveCtx, w: W, x: number, y: number, z: number) {
  const g = gOf(c);
  if (w !== uW(c) && !held(c, w)) return;   // 放开（轰飞、落地）以后就不再摆它
  if (w === 'p') {
    const p = g.player; p.x = x; p.y = y; p.st.x = x; p.st.y = y;
    z = Math.max(0, z);
    if (g.isFlying) { p.z = p.zTarget = Math.max(p.z, z); }
    else { c.data.pz = z; c.B.playerLift = z; p.st.lift = p.z + z; }
    return;
  }
  w.x = x; w.y = y; w.kx = w.ky = 0; w.flyH = Math.max(0, z); w.lift = 0;
  if (w.cs) { w.cs.x = x; w.cs.y = y; w.cs.lift = w.flyH; }
}
/** 放回地上（被接管的敌人飞着的高度清掉；你：离地清零） */
function ground(c: MoveCtx, w: W) {
  if (w === 'p') { c.data.pz = 0; c.B.playerLift = 0; const p = gOf(c).player; p.st.lift = p.z; return; }
  if (!(w.def.flying || (w.canFly && w.flyH > 30 && !held(c, w)))) w.flyH = 0;
  w.lift = 0;
}
/** 播动作（换了才重播）；again = 同一个动作再从头来一遍 */
function pose(c: MoveCtx, w: W, a: Action, again = false) {
  const key = 'act_' + (w === 'p' ? 'p' : String((w as { id?: number }).id ?? w.name));
  if (w === 'p') {
    // r12-anim：抓着你的时候姿势一直摆着（放开 / 收场时 release 收掉）；没抓着（已经放开、落地后补一下受击）只摆半息，不盖住之后的走跑
    const hold = held(c, 'p');
    if (again || c.data[key] !== a || (hold && c.B.actNow.a !== a)) { c.data[key] = a; c.data.pAct = hold ? a : ''; c.B.playAct(a, hold ? 30 : 0.5); }
    return;
  }
  if (w.cs && (again || w.cs.action !== a)) w.cs.restart(a);
  c.data[key] = a;
}
/** 朝向（立刻转过去，不慢慢扭） */
function face(c: MoveCtx, w: W, dx: number, dy: number) {
  if (Math.abs(dx) + Math.abs(dy) < 1e-4) return;
  const st = w === 'p' ? gOf(c).player.st : w.cs; if (!st) return;
  st.faceToward(dx, dy, false); st.yaw = st.targetYaw;
  if (w !== 'p') w.facing = dx > 0 ? 1 : -1;
}
/** 打一下（k 攻力倍数，kind 记进近战日志：hs2-招名-哪一下） */
function hit(c: MoveCtx, w: W, k: number, kind: string): boolean { return c.hit(w, k * dmgK(c, w), 'hs2-' + kind); }
/** 他打你时收着点：切磋（点到为止）四成、真怒五成（一套招下来伤你三成上下，不至于一套带走）；打妖兽不收 */
function dmgK(c: MoveCtx, w: W): number {
  if (w !== 'p' || !c.user || !HS || HS.ent !== c.user) return 1;
  return HS.mode === 'spar' ? 0.4 : 1;   // 惹怒是真打（设计：认真打、致死），不打折
}
/** 命中的拳风（近战现成的那一记） */
function hitFx(c: MoveCtx, w: W, dir: number, power: number, color = '255,206,140') {
  const q = pos(c, w);
  c.fx({ k: 'bxhit', anchor: { x: q.x, y: q.y, offsetY: -q.z }, x: q.x, y: q.y - 62, color, power, dir, r: 4 });
}
/** 放开并轰飞（你从半空被轰飞：从那个高度接着飞） */
function fling(c: MoveCtx, w: W, ux: number, uy: number, D: number, vz: number) {
  const z = pos(c, w).z;
  release(c, w);
  if (w === 'p') {
    c.launch('p', ux, uy, D, vz);
    const pb = c.B.pb; if (pb.air && !gOf(c).isFlying) { pb.z = Math.max(pb.z, z); c.B.playerLift = pb.z; }
    return;
  }
  // 从半空扔出去的：先按贴地起飞（不然离地三十以上会被当成御器的，悬着不落），再把高度补回去
  if (!w.def.flying) { w.flyH = 0; w.lift = 0; }
  if (!c.launch(w, ux, uy, D, vz)) { ground(c, w); return; }
  const b = c.B.peek(w); if (b && !w.def.flying && z > 0) { b.z = z; w.lift = z; }
}
/** 放开、落地、硬直一会儿（被砸进坑里、被点了穴） */
function drop(c: MoveCtx, w: W, stagger: number) {
  release(c, w); ground(c, w);
  if (w === 'p') { c.B.pb.staggerT = Math.max(c.B.pb.staggerT, stagger); return; }
  const b = c.B.body(w); b.staggerT = Math.max(b.staggerT, stagger); c.B.track(w);
}
/** 出招者的残影（人形画半透明的人；最多十二个） */
function ghost(c: MoveCtx, w: W, color = '255,214,150', dur = 0.32) {
  const B = c.B; if (B.ghosts.length >= 12) return;
  const q = pos(c, w), st = w === 'p' ? gOf(c).player.st : w.cs;
  B.ghosts.push({ e: w === 'p' ? null : w, x: q.x, y: q.y, z: q.z, t: 0, dur, yaw: st?.yaw ?? 0, color } as Ghost);
}
/** 收尾大字：只有你出招（或你挨打）时才挂（他打妖兽时屏幕上不出字） */
function finisher(c: MoveCtx, name: string) {
  if (isPU(c)) { const t = c.target; if (t && t !== 'p') c.B.combo(t, name); return; }
  if (c.target === 'p') c.B.finisher = { s: `${name}！`, t: 0 };
}
/** 你被接管时的地上高度也要写进画面（game.ts 在招式之前就把 lift 写了） */
function syncP(c: MoveCtx) { if (held(c, 'p') || (isPU(c) && c.data.pz !== undefined)) { const g = gOf(c), p = g.player, z = (c.data.pz as number) ?? 0; if (!g.isFlying) { c.B.playerLift = z; p.st.lift = p.z + z; } } }
/** 对手还在不在（死了、走了、沉水了：收场） */
function gone(c: MoveCtx, w: W | null): boolean {
  if (!w) return true;
  if (w === 'p') return gOf(c).hero.dead;
  return w.dead || w.gone || !(c.B.combat.enemies.includes(w) || c.B.combat.allies.includes(w));
}
/** 他本人打着打着收手了（切磋结束、回到平时）：招式跟着停 */
function stood(c: MoveCtx): boolean { return !!c.user && !!HS && HS.ent === c.user && HS.mode === 'calm' && !c.data.forced; }

// ------------------------------------------------------------------ 打击表现：合并后接第一批的共用效果（world/impactfx.ts）；本地的墨爆、竖环留作点缀
/** IMPACT: 黑白闪（第一批：后期黑白反相定格一两帧）——本地：一团墨爆 + 色差 */
function inkFlash(c: MoveCtx, q: P3, k: number) { c.B.impact.inkFlash(); hs2fx({ k: 'ink', x: q.x, y: q.y, z: q.z, p: k }); const g = gOf(c); g.aberrKick = Math.max(g.aberrKick, 0.35 * k); }
/** IMPACT: 背后炸开的冲击波（第一批：命中瞬间对手背后扩散的冲击波）——本地：一圈竖环 + 一锥气流 */
function burst(q: P3, dir: number, p: number) { hs2fx({ k: 'burst', x: q.x, y: q.y, z: q.z, dir, p }); }
/** IMPACT: 超高速追击线（第一批：人消失，只剩一道线）——本地：一道光线 */
function blink(a: P3, b: P3) { const I = HS?.game.combat.brawl.impact; if (I) I.blink(a.x, a.y, b.x, b.y, a.z, b.z); else hs2fx({ k: 'blink', x: a.x, y: a.y, z: a.z, x2: b.x, y2: b.y, z2: b.z }); }
/** IMPACT: 踏空气环（第一批：空中每踩一步炸开一圈气环）——本地：脚下一圈环 */
function airRing(q: P3) { const I = HS?.game.combat.brawl.impact; if (I) I.airRing(q.x, q.y, q.z); else hs2fx({ k: 'ring', x: q.x, y: q.y, z: q.z }); }
/** IMPACT: 定格特写（第一批：出手那一瞬全屏切入半秒的特写图）——本地：慢镜头 + 镜头猛推 */
function closeUp(c: MoveCtx, k: number) { if (!c.B.impact.cutIn('fist')) gOf(c).slowmo(0.12 * k); c.cam(1.1 * k); }   // 定格特写有频率上限（一场最多两次）；没切成就照旧慢镜头

// ------------------------------------------------------------------ 起手的通用部分
/** 对手、方向；出招者是你时找不到人给一句 */
function needFoe(c: MoveCtx): boolean {
  if (c.target) return true;
  if (isPU(c)) gOf(c).toast('身前没有对手。', 'info');
  return false;
}
/** 他起手报招名（和近战 AI 出特殊招式一样的小字） */
function callName(c: MoveCtx, id: string) {
  if (!c.user) return;
  c.B.combat.texts.push({ x: c.user.x, y: c.user.y - 150, s: NAME[id] ?? id, color: '#ffb08a', t: 0, vy: -18 } as never);
}
/** 一步贴到对手跟前（d 远；返回贴过去的落点） */
function closeIn(c: MoveCtx, tw: W, d: number): P3 {
  const u = pos(c, uW(c)), t = pos(c, tw), dx = u.x - t.x, dy = u.y - t.y, L = Math.hypot(dx, dy) || 1;
  if (L <= d + 20) return u;
  const q = { x: t.x + dx / L * d, y: t.y + dy / L * d, z: 0 };
  blink(u, q);   // IMPACT: 超高速追击线
  put(c, uW(c), q.x, q.y, 0);
  return q;
}
/** 共用的收场：放开所有被接管的人、关掉画面件 */
function endAll(c: MoveCtx) {
  const H = c.data.held as Set<W> | undefined;
  if (H) for (const w of [...H]) { release(c, w); ground(c, w); }
  for (const k of ['drag', 'barrage', 'fall', 'fall2', 'spin'] as const) { const it = c.data[k] as { on: boolean } | undefined; if (it) it.on = false; }
  if (c.data.pz !== undefined && isPU(c)) { c.data.pz = 0; c.B.playerLift = 0; }
  if (c.data.esc) escHide();
}

// ------------------------------------------------------------------ 挣脱（你被擒拿时）：连按方向键 / 闪避键 / 点屏幕
let ESC: { el: HTMLDivElement; fill: HTMLDivElement; taps: number; n: number } | null = null;
function escShow(text: string) {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function' || !document.body) return;
  if (!ESC) {
    const el = document.createElement('div') as HTMLDivElement;
    el.className = 'hs2-escape';
    el.style.cssText = 'position:fixed;inset:0;z-index:60;touch-action:none;';
    el.innerHTML = '<div style="position:absolute;left:50%;bottom:24%;width:min(340px,80vw);transform:translateX(-50%);text-align:center;font:600 15px/1.4 serif;color:#ffe9c4;text-shadow:0 1px 3px #000,0 0 8px #000">'
      + '<div class="hs2-esc-t" style="margin-bottom:6px;letter-spacing:2px"></div>'
      + '<div style="height:12px;border-radius:6px;background:rgba(20,12,6,.72);border:1px solid rgba(255,214,150,.6);overflow:hidden">'
      + '<div class="hs2-esc-f" style="height:100%;width:100%;background:linear-gradient(90deg,#c0582a,#ffd08a);transform-origin:0 50%;transform:scaleX(0);transition:transform .08s linear"></div></div></div>';
    const fill = el.querySelector('.hs2-esc-f') as HTMLDivElement;
    const box = { el, fill, taps: 0, n: 0 };
    el.addEventListener('pointerdown', (e) => { box.taps++; e.preventDefault(); e.stopPropagation(); });
    ESC = box;
  }
  const t = ESC.el.querySelector('.hs2-esc-t'); if (t) t.textContent = text;
  ESC.fill.style.transform = 'scaleX(0)';
  if (!ESC.el.parentNode) document.body.appendChild(ESC.el);
  ESC.el.style.opacity = '1';
}
function escSet(k: number) { if (ESC) ESC.fill.style.transform = `scaleX(${clamp(k, 0, 1).toFixed(3)})`; }
function escHide() { if (ESC?.el.parentNode) ESC.el.parentNode.removeChild(ESC.el); }
/** 这一帧按了几下（方向键 / 闪避键按下的那一下、摇杆推出去、点屏幕） */
function escPresses(c: MoveCtx): number {
  const g = gOf(c), keys = g.input.keys, prev = (c.data.escKeys ??= new Set<string>()) as Set<string>;
  let n = 0;
  for (const k of ['w', 'a', 's', 'd', 'dodge', 'up', 'down', 'left', 'right']) { const on = keys.has(k); if (on && !prev.has(k)) n++; if (on) prev.add(k); else prev.delete(k); }
  const jm = g.input.joyMag > 0.5, jq = jm ? Math.round(Math.atan2(g.input.joy.y, g.input.joy.x) / (Math.PI / 2)) : 99;
  if (jm && jq !== c.data.escJoy) n++;
  c.data.escJoy = jq;
  if (ESC) { n += ESC.taps; ESC.taps = 0; }
  return n;
}
/** 擒拿期间每帧：你被抓着就数按键、涨进度；挣脱了返回 true（反震：他被震退一步、硬直，你短暂无敌） */
function escTick(c: MoveCtx, id: string): boolean {
  if (c.target !== 'p' || !held(c, 'p')) return false;
  if (!c.data.esc) { c.data.esc = 0.0001; escShow(gOf(c).input.joyMag >= 0 && isTouchish() ? '连点屏幕挣脱！' : '连按方向键 / 空格挣脱！'); }
  const n = escPresses(c);
  if (n > 0) c.data.esc = Math.min(1, (c.data.esc as number) + n * (ESC_STEP[id] ?? 0.12));
  escSet(c.data.esc as number);
  if ((c.data.esc as number) < 1) return false;
  // 挣脱：把他的手甩开
  const g = gOf(c), p = g.player, u = c.user;
  release(c, 'p'); ground(c, 'p');
  escHide(); c.data.escaped = true;
  g.combat.invulnT = Math.max(g.combat.invulnT, 0.5);
  c.fx({ k: 'tech', anchor: { x: p.x, y: p.y, offsetY: 0 }, x: p.x, y: p.y - 60, color: '255,226,150', r: 280 });
  g.juice(0.05, 0.35); audio.sfx('whoosh', p.x, p.y);
  c.B.combat.texts.push({ anchor: { x: p.x, y: p.y, offsetY: 0 }, x: p.x, y: p.y - 150, s: '挣脱！', color: '#ffe0a0', t: 0, vy: -30, big: true } as never);
  if (u) { const b = c.B.body(u); b.staggerT = Math.max(b.staggerT, 0.6); const dx = u.x - p.x, dy = u.y - p.y, L = Math.hypot(dx, dy) || 1; put(c, u, u.x + dx / L * 90, u.y + dy / L * 70, 0); }
  return true;
}
const isTouchish = () => typeof window !== 'undefined' && typeof (window as { matchMedia?: (q: string) => { matches: boolean } }).matchMedia === 'function' && !!window.matchMedia('(pointer: coarse)').matches;

// ------------------------------------------------------------------ 1. 流星百裂
// r8-p1 换成参考视频「闪击快打」（23.55–24.35）：闪步冲到面前的第一拳（身后青蓝速度带）→ 贴身连打两拳 → 拧身一记带红光的勾拳 → 高侧踢（腿抬到肩高、
// 一大团蓝白冲击带光刺）把人踢飞 → 收腿时再补一下 → 收回架势。每下之间 0.08–0.14 息，照视频的帧时间。
// 伤害、冷却、击飞和原来一样：十三份 0.12 攻力分到四下里（3 + 3 + 2 + 5 份），最后一脚是原来的收尾 1.0、照旧轰飞 1700。
const LX = { IN: 0.03, H1: 0.07, J2: 0.21, J3: 0.29, UP: 0.38, FIN: 0.52, BUB: 0.62, END: 0.85, TICKS: [3, 3, 2, 5] };
const LIUXING: SpecialMove = {
  id: 'liuxing', name: '流星百裂', glyph: '星', desc: '原地一阵残拳，拳影成片，最后一拳把人轰飞。', who: 'npc', cd: 9, range: 420,
  can: (_B, u) => !!u && u === HS?.ent,
  begin(c) {
    if (!needFoe(c)) return false;
    callName(c, 'liuxing');
    c.data.n = 0; c.data.k = 0;
    return true;
  },
  tick(c) {
    const tw = c.target!, uw = uW(c), K = HS2K.liuxing, X = p1(c.B);
    if (gone(c, tw) || stood(c)) return false;
    syncP(c); holdP(c);
    const T = c.t;
    sideCam(c, 0.4, 1.8, 0.35);
    if (!c.data.go) {
      c.data.go = 1; seize(c, tw);
      const u = pos(c, uw), t = pos(c, tw); c.data.dir = Math.atan2(t.y - u.y, t.x - u.x);
      face(c, uw, t.x - u.x, t.y - u.y); face(c, tw, u.x - t.x, u.y - t.y);
      pose(c, uw, 'p1Dash');
      audio.sfx('whoosh', u.x, u.y);
    }
    // 闪步贴上去（落点横着摆在对手跟前），出第一拳
    if (!c.data.in && T >= LX.IN) {
      c.data.in = 1;
      const u = pos(c, uw), q = sideSpot(c, tw, 92), t = pos(c, tw);
      if (Math.hypot(q.x - u.x, q.y - u.y) > 30) { X.dash(uw, u, { x: q.x, y: q.y, z: 0 }, { n: 3 }); put(c, uw, q.x, q.y, 0); }
      c.data.dir = Math.atan2(t.y - q.y, t.x - q.x);
      face(c, uw, t.x - q.x, t.y - q.y); face(c, tw, q.x - t.x, q.y - t.y);
      pose(c, uw, 'p1Jab', true);
    }
    const dir = c.data.dir as number, ux = Math.cos(dir), uy = Math.sin(dir);
    /** 第 i 下：打 TICKS[i] 份、被打的人往后挪一点、闪白、星闪 + 冲击线 + 弧光 */
    const strike = (i: number, tier: 1 | 2 | 3, kind: 'punch' | 'upper', col: string) => {
      if ((c.data.n as number) > i) return;
      c.data.n = i + 1;
      if (held(c, tw)) { const t = pos(c, tw); put(c, tw, t.x + ux * 8, t.y + uy * 8, 0); }
      hit(c, tw, K.tick * LX.TICKS[i], 'liuxing');
      pose(c, tw, 'hit', true);
      X.hit(c, tw, kind === 'upper' ? -Math.PI / 2 : dir, tier, { arc: arcPts(c, tw, kind), col, z: kind === 'upper' ? 130 : 110, slide: false });
      if (i === 2) { const t = pos(c, tw); X.fx({ k: 'p1elec', x: t.x, y: t.y, r: 80, anchor: { x: t.x, y: t.y, offsetY: -(t.z + 110) } }); }
      c.shake(0.12 + tier * 0.05);
    };
    if (T >= LX.H1) strike(0, 2, 'punch', '170,225,255');
    if (T >= LX.J2 - P1T.jab.hit && !c.data.a2) { c.data.a2 = 1; pose(c, uw, 'p1Jab', true); }
    if (T >= LX.J2) strike(1, 2, 'punch', '170,225,255');
    if (T >= LX.J3 - P1T.jab.hit && !c.data.a3) { c.data.a3 = 1; pose(c, uw, 'p1Jab', true); }
    if (T >= LX.J3) strike(2, 1, 'punch', '170,225,255');
    if (T >= LX.UP - P1T.upper.hit && !c.data.a4) { c.data.a4 = 1; pose(c, uw, 'p1Upper', true); }
    if (T >= LX.UP) strike(3, 2, 'upper', '255,90,70');
    if (T >= LX.FIN - P1T.highKick.hit && !c.data.fin) { c.data.fin = 1; pose(c, uw, 'p1HighKick', true); }
    if (T >= LX.FIN && !c.data.k) {
      c.data.k = 1;
      const t = pos(c, tw);
      hit(c, tw, K.fin, 'liuxing-fin');
      X.hit(c, tw, dir, 3, { arc: arcPts(c, tw, 'kick'), col: '150,210,255', z: 135 });
      X.fx({ k: 'p1sphere', x: t.x, y: t.y, r: 80, power: 1, color: '150,210,255', anchor: { x: t.x, y: t.y, offsetY: -(t.z + 135) } });
      c.fx({ k: 'launch', anchor: { x: t.x, y: t.y, offsetY: -t.z }, x: t.x, y: t.y - 60, color: '190,220,255', power: 1.5, dir, r: 1 });   // r9：2.6 → 1.5（推近的镜头里一团白把被打的人整个盖住）
      burst({ x: t.x, y: t.y, z: 60 }, dir, 1.6);   // IMPACT: 背后冲击波（r9：2.4 → 1.6）
      inkFlash(c, t, 1);   // IMPACT: 黑白闪
      fling(c, tw, ux, uy, 1700, 420);
      gOf(c).juice(0.08, 0.55); c.cam(1.2); audio.sfx('boom', t.x, t.y);
      finisher(c, '流星百裂');
    }
    // 收腿时再补一下（只是光：一圈冲击泡）
    if (T >= LX.BUB && !c.data.bub) { c.data.bub = 1; const t = pos(c, tw); X.fx({ k: 'p1ring', x: t.x, y: t.y, r: t.z + 110, dir, power: 0.7, color: '150,205,255' }); }
    return T < LX.END;
  },
  end(c) { endAll(c); },
};

// ------------------------------------------------------------------ 2. 燕回
const YANHUI: SpecialMove = {
  id: 'yanhui', name: '燕回', glyph: '燕', desc: '绕着对手来回穿身而过，每穿一次打一下，身后留下交叉的残影线；最后一记回身轰飞。', who: 'both', realm: 2, mp: 0.1, cd: 8, range: 520, color: '255,214,150',
  can: (_B, u) => !u || u === HS?.ent,
  begin(c) {
    if (!needFoe(c)) return false;
    callName(c, 'yanhui');
    const tw = c.target!, u = pos(c, uW(c)), t = pos(c, tw);
    seize(c, tw);
    // r8-p1 照参考视频「闪电之舞」：不再绕五角星，改成画面上左右来回——闪步穿过去、回身一记（低扫 / 侧踢交替），六个落点左右交替、上下错开一点；
    // 他放时沿画面横向，你放时沿你和对手的连线
    const R = 300, dx = u.x - t.x, dy = u.y - t.y, L = Math.hypot(dx, dy) || 1;
    let ax: number, ay: number, s0 = 1;
    if (byHs(c)) { const r = screenRight(c.B); ax = r.x; ay = r.y; s0 = dx * r.x + dy * r.y >= 0 ? 1 : -1; } else { ax = dx / L; ay = dy / L; }
    const nx = -ay, ny = ax, off = [-40, 30, 55, -35, 20, 0];
    const V: [number, number][] = [];
    for (let k = 0; k <= 5; k++) { const sg = s0 * (k % 2 ? -1 : 1); V.push([ax * sg * R + nx * off[k], ay * sg * R + ny * off[k]]); }
    c.data.V = V; c.data.cx = t.x; c.data.cy = t.y; c.data.sx = u.x; c.data.sy = u.y; c.data.hits = 0; c.data.gT = 0; c.data.seg = -1;
    return true;
  },
  tick(c, dt) {
    const tw = c.target!, uw = uW(c), K = HS2K.yanhui, pu = isPU(c);
    if (gone(c, tw) || stood(c)) return false;
    syncP(c); holdP(c);
    const V = c.data.V as [number, number][], T = c.t, X = p1(c.B);
    void dt;
    sideCam(c, 0.4, 1.05, 0);
    // 中心：抓得住的钉在原地；抓不住的（首领）跟着它
    let cx = c.data.cx as number, cy = c.data.cy as number;
    if (!held(c, tw)) { const t = pos(c, tw); cx = t.x; cy = t.y; }
    else { put(c, tw, cx, cy, 0); pose(c, tw, 'hit'); }
    const T0 = 0.1, SEG = 0.17;
    if (T < T0) {
      const k = ease(T / T0), x = lerp(c.data.sx as number, cx + V[0][0], k), y = lerp(c.data.sy as number, cy + V[0][1], k);
      put(c, uw, x, y, 0); pose(c, uw, 'p1Dash'); face(c, uw, cx - x, cy - y);
      return true;
    }
    const i = Math.floor((T - T0) / SEG);
    if (i < 5) {
      // 每段开头：一记闪步穿过对手到另一侧（人直接到了：青蓝速度带、同一姿势的残影、起步的土），回身一记——低扫（橙弧）、侧踢（青蓝光柱）交替
      const sweep = i % 2 === 0, act: Action = sweep ? 'p1Sweep' : 'p1SideKick', hitAt = sweep ? P1T.sweep.hit : P1T.sideKick.hit;
      if ((c.data.seg as number) < i) {
        c.data.seg = i;
        const a = { x: cx + V[i][0], y: cy + V[i][1], z: 0 }, b = { x: cx + V[i + 1][0], y: cy + V[i + 1][1], z: 0 };
        put(c, uw, b.x, b.y, 0); face(c, uw, cx - b.x, cy - b.y); pose(c, uw, act, true);
        X.dash(uw, a, b, { n: 2 });
        hs2add('lines', { x0: a.x, y0: a.y, x1: b.x, y1: b.y, z: 58, t0: gOf(c).time, dur: 1.6, c: '120,215,255' });
        hs2fx({ k: 'pass', x: a.x, y: a.y, x2: b.x, y2: b.y, z: 58 });
        audio.sfx('whoosh', cx, cy);
      }
      if (T - T0 - i * SEG >= hitAt && (c.data.hits as number) <= i) {
        c.data.hits = i + 1;
        const b = { x: cx + V[i + 1][0], y: cy + V[i + 1][1] }, dir = Math.atan2(cy - b.y, cx - b.x);
        hit(c, tw, pu ? K.pPass : K.pass, 'yanhui');
        X.hit(c, tw, dir, 2, { arc: arcPts(c, tw, sweep ? 'sweep' : 'kick'), col: sweep ? '255,160,70' : '120,215,255', z: sweep ? 40 : 100, slide: false });
        if (!sweep) { const u2 = pos(c, uw); X.fx({ k: 'p1beam', x: u2.x + Math.cos(dir) * 50, y: u2.y + Math.sin(dir) * 50, r: 100, dir, power: 1.1, color: '90,225,255' }); }
        if (held(c, tw)) pose(c, tw, 'hit', true);
        c.shake(0.15);
      }
      return true;
    }
    // 收尾：一记闪步到另一边，跳起旋身侧踢——一大团蓝白光球，把人踢飞
    const Tf = T0 + 5 * SEG;
    const ox = cx - V[5][0] * 0.55, oy = cy - V[5][1] * 0.55;
    if (!c.data.turn) {
      c.data.turn = 1;
      const a = { x: cx + V[5][0], y: cy + V[5][1], z: 0 };
      put(c, uw, ox, oy, 0); face(c, uw, cx - ox, cy - oy); pose(c, uw, 'p1Dash', true);
      X.dash(uw, a, { x: ox, y: oy, z: 0 }, { n: 2 });
    }
    if (T >= Tf + 0.26 - P1T.jumpKick.hit && !c.data.jk) { c.data.jk = 1; pose(c, uw, 'p1JumpKick', true); }
    if (T >= Tf + 0.26 && !c.data.fin) {
      c.data.fin = 1;
      const dir = Math.atan2(cy - oy, cx - ox), t = pos(c, tw);
      hit(c, tw, pu ? K.pFin : K.fin, 'yanhui-fin');
      X.hit(c, tw, dir, 3, { arc: arcPts(c, tw, 'kick'), col: '150,210,255', z: 120 });
      X.fx({ k: 'p1sphere', x: t.x, y: t.y, r: 110, power: 1.2, color: '160,215,255', anchor: { x: t.x, y: t.y, offsetY: -(t.z + 115) } });
      X.shock(t.x, t.y, t.z + 110, dir, 1, '150,205,255');   // 竖着的冲击环 + 扭曲冲击波（三维模块）
      c.fx({ k: 'launch', anchor: { x: t.x, y: t.y, offsetY: -t.z }, x: t.x, y: t.y - 60, color: '190,220,255', power: 1.4, dir, r: 1 });   // r9：2.2 → 1.4
      burst({ x: t.x, y: t.y, z: 60 }, dir, 2);   // IMPACT: 背后冲击波
      fling(c, tw, Math.cos(dir), Math.sin(dir), 1500, 360);
      gOf(c).juice(0.07, 0.45); c.cam(1);
      audio.sfx('boom', t.x, t.y);
      finisher(c, '燕回');
    }
    return T < Tf + 0.6;
  },
  end(c) { endAll(c); },
};

// ------------------------------------------------------------------ 3. 十方弹
const SHIFANG: SpecialMove = {
  id: 'shifang', name: '十方弹', glyph: '弹', desc: '把人打飞，瞬移到落点再打回来，在天上地下六个点之间来回弹，最后一下砸进地里。', who: 'both', realm: 3, mp: 0.12, cd: 12, range: 480, color: '255,190,120',
  can: (_B, u) => !u || u === HS?.ent,
  begin(c) {
    if (!needFoe(c)) return false;
    const tw = c.target!;
    if (!seize(c, tw)) { if (isPU(c)) gOf(c).toast('它不吃这一套（打不动）。', 'info'); return false; }
    callName(c, 'shifang');
    const t = pos(c, tw), u = pos(c, uW(c));
    const th0 = Math.atan2(t.y - u.y, t.x - u.x), seed = hash32(Math.round(t.x), Math.round(t.y), 0x5f);
    const P: P3[] = [];
    for (let k = 0; k < 6; k++) {
      const air = k % 2 === 0, th = th0 + (k === 0 ? 0 : k * 2.35 + ((seed >> k) & 3) * 0.12), r = air ? 360 + (k % 3) * 40 : 320;
      let x = t.x + Math.cos(th) * r, y = t.y + Math.sin(th) * r * 0.8, z = air ? 330 + ((seed >> (k + 3)) & 1) * 60 : 40;
      if (!air && !walkable(c, x, y)) { x = t.x + Math.cos(th) * r * 0.5; y = t.y + Math.sin(th) * r * 0.4; if (!walkable(c, x, y)) z = 300; }
      P.push({ x, y, z });
    }
    c.data.P = P; c.data.C = { x: t.x, y: t.y, z: 0 }; c.data.n = 0; c.data.leg = -1;
    return true;
  },
  tick(c) {
    const tw = c.target!, uw = uW(c), K = HS2K.shifang, pu = isPU(c), X = p1(c.B);
    if (gone(c, tw) || stood(c)) return false;
    syncP(c); holdP(c);
    const P = c.data.P as P3[], C0 = c.data.C as P3, T = c.t;
    const LEG = 0.22, T0 = 0.14;
    sideCam(c, 0.4, 1.0, 0);
    // 起手：闪步贴上去一拳（r8-p1：照「闪电之舞」——每一下都是闪步追上去、侧踢 / 腾空旋踢打回来，青蓝速度带连着）
    if (T < T0) {
      if (!c.data.in) {
        c.data.in = 1;
        const u0 = pos(c, uw), q = byHs(c) ? sideSpot(c, tw, 85) : null;
        if (q && Math.hypot(q.x - u0.x, q.y - u0.y) > 30) { X.dash(uw, u0, q, { n: 2 }); put(c, uw, q.x, q.y, 0); } else closeIn(c, tw, 85);
        const u = pos(c, uw); face(c, uw, C0.x - u.x, C0.y - u.y); pose(c, uw, 'p1Jab', true);
      }
      put(c, tw, C0.x, C0.y, 0); pose(c, tw, 'hit');
      return true;
    }
    const pts = [C0, ...P, C0];   // 0 起点 → 1..6 六个弹点 → 7 砸回起点
    const j = Math.min(6, Math.floor((T - T0) / LEG));
    const u = clamp((T - T0 - j * LEG) / LEG, 0, 1);
    const A = pts[j], Bp = pts[j + 1], last = j === 6;
    // 被打的人：这一段从 A 飞到 B（最后一段往下砸得更快）
    const k = last ? easeIn(u) : easeOut(u);
    const vx = lerp(A.x, Bp.x, k), vy = lerp(A.y, Bp.y, k), vz = lerp(A.z, Bp.z, k) + (last ? 0 : 70 * Math.sin(Math.PI * u));
    put(c, tw, vx, vy, vz); pose(c, tw, 'tumble'); face(c, tw, A.x - Bp.x, A.y - Bp.y);
    // 每段开头：这一下打出去（j = 0 是起手那一拳）
    if ((c.data.leg as number) < j) {
      c.data.leg = j;
      const dir = Math.atan2(Bp.y - A.y, Bp.x - A.x);
      if (j === 0) { hit(c, tw, pu ? K.pBounce : K.bounce, 'shifang'); c.data.n = 1; X.hit(c, tw, dir, 2, { arc: arcPts(c, tw, 'punch'), z: 100, slide: false }); burst(A, dir, 1.4); }   // IMPACT: 背后冲击波
      else if (!last) {
        hit(c, tw, pu ? K.pBounce : K.bounce, 'shifang'); c.data.n = (c.data.n as number) + 1;
        X.hit(c, tw, dir, 2, { arc: arcPts(c, tw, 'kick'), col: '120,215,255', z: 90, slide: false }); burst(A, dir, 1.2);   // IMPACT: 背后冲击波
        { const u2 = pos(c, uw); X.fx({ k: 'p1beam', x: u2.x + Math.cos(dir) * 40, y: u2.y + Math.sin(dir) * 40, r: u2.z + 95, dir, power: 0.9, color: '90,225,255' }); }
        if (A.z > 120) airRing({ x: pos(c, uw).x, y: pos(c, uw).y, z: A.z });   // IMPACT: 踏空气环
        else c.fx({ k: 'crater', x: A.x, y: A.y, power: 1, r: 80, dir });
        c.shake(0.18); audio.sfx('whoosh', A.x, A.y);
      } else { pose(c, uw, 'hsHammer', true); hit(c, tw, pu ? K.pBounce : K.bounce, 'shifang'); c.data.n = (c.data.n as number) + 1; hitFx(c, tw, Math.PI / 2, 2); airRing({ x: A.x, y: A.y, z: A.z + 70 }); }   // IMPACT: 踏空气环

    }
    // 出招者：这一段的后半瞬移到 B 的另一侧等着（朝下一个点打回去）；最后一段跟着砸下来
    if (!last) {
      if (u > 0.3 && (c.data.at as number | undefined) !== j) {
        c.data.at = j;
        const N = pts[j + 2], ndx = N.x - Bp.x, ndy = N.y - Bp.y, nL = Math.hypot(ndx, ndy) || 1;
        const hx = Bp.x - ndx / nL * 85, hy = Bp.y - ndy / nL * 68, hz = Bp.z > 120 ? Bp.z : 0;
        const from = pos(c, uw); blink(from, { x: hx, y: hy, z: hz });   // IMPACT: 超高速追击线
        put(c, uw, hx, hy, hz); face(c, uw, ndx, ndy);
        X.dash(uw, from, { x: hx, y: hy, z: hz }, { n: 2, spikes: false });
        // 闪步到下一个弹点等着：空中那几下腾空旋踢、地上的侧踢，最后一下双拳砸落（卡帧动作，命中那一刻正好踢出去）
        if (j + 1 === 6) pose(c, uw, 'hsHammer', true);
        else { pose(c, uw, 'p1Dash', true); c.data.kAt = T0 + (j + 1) * LEG - (hz > 120 ? P1T.jumpKick.hit : P1T.sideKick.hit); c.data.kAct = hz > 120 ? 'p1JumpKick' : 'p1SideKick'; }
      }
      if (c.data.kAt && T >= (c.data.kAt as number)) { c.data.kAt = 0; pose(c, uw, c.data.kAct as Action, true);
      }
      if (u <= 0.3 && j > 0) { const q = pos(c, uw); put(c, uw, q.x, q.y, q.z); }
    } else {
      const q = pos(c, uw); put(c, uw, lerp(A.x, Bp.x, k) - 40, lerp(A.y, Bp.y, k) - 20, Math.max(0, vz + 80 * (1 - k)));
      void q;
    }
    // 砸地
    if (last && u >= 1 && !c.data.fin) {
      c.data.fin = 1;
      const g = gOf(c);
      hit(c, tw, pu ? K.pFin : K.fin, 'shifang-fin');
      c.fx({ k: 'slam', x: C0.x, y: C0.y, power: 3, r: 240, dir: 0 });
      try { g.combat.wreck.radial(C0.x, C0.y, 280, 3.2, uw, { mark: 'pit' }); } catch { /* 破坏系统出错不拖垮出招 */ }
      inkFlash(c, { x: C0.x, y: C0.y, z: 0 }, 1.2);   // IMPACT: 黑白闪
      closeUp(c, 1);   // IMPACT: 定格特写
      g.juice(0.1, 0.75); audio.sfx('boom', C0.x, C0.y);
      drop(c, tw, 1.1);
      finisher(c, '十方弹');
      c.data.tf = T;
    }
    if (c.data.fin) {
      const k2 = clamp((T - (c.data.tf as number)) / 0.25, 0, 1), q = pos(c, uw);
      put(c, uw, q.x, q.y, q.z * (1 - k2)); if (k2 >= 1) pose(c, uw, 'idle');
      return T < (c.data.tf as number) + 0.45;
    }
    return true;
  },
  end(c) { endAll(c); },
};

// ------------------------------------------------------------------ 4. 天地往返
const TD = { T0: 0.12, CYC: 0.58, RISE: 0.3, HANG: 0.06, FALL: 0.18, H: 540 };
const TIANDI: SpecialMove = {
  id: 'tiandi', name: '天地往返', glyph: '天', desc: '一脚踢上天，追上去砸下来，落地前接住再踢上去，来回三趟，最后砸进地里。', who: 'npc', cd: 12, range: 420,
  can: (_B, u) => !!u && u === HS?.ent,
  begin(c) {
    if (!needFoe(c)) return false;
    if (!seize(c, c.target!)) return false;
    callName(c, 'tiandi');
    const t = pos(c, c.target!); c.data.X = t.x; c.data.Y = t.y; c.data.trips = 0; c.data.ev = 0;
    return true;
  },
  tick(c) {
    const tw = c.target!, uw = uW(c), K = HS2K.tiandi, T = c.t;
    if (gone(c, tw) || stood(c)) return false;
    syncP(c); holdP(c);
    const X0 = c.data.X as number, Y0 = c.data.Y as number, dx = c.dirX * 40, dy = c.dirY * 32;
    if (T < TD.T0) {
      if (!c.data.in) { c.data.in = 1; closeIn(c, tw, 80); const u = pos(c, uw); face(c, uw, X0 - u.x, Y0 - u.y); pose(c, uw, 'hsKick', true); }
      put(c, tw, X0, Y0, 0); pose(c, tw, 'hit');
      return true;
    }
    const i = Math.min(2, Math.floor((T - TD.T0) / TD.CYC)), s = T - TD.T0 - i * TD.CYC;
    const bx = X0 + dx * i, by = Y0 + dy * i, nx = bx + dx, ny = by + dy;
    const z0 = i === 0 ? 0 : 50;
    // 事件按次序：0 踢起、1 追上去、2 砸下、3 接住踢起（最后一趟是砸进地里）
    const ev = (n: number) => { if ((c.data.ev as number) > n) return false; c.data.ev = n + 1; return true; };
    const E = i * 4;
    let vz: number, vx = bx, vy = by;
    if (s < TD.RISE) { vz = lerp(z0, TD.H, easeOut(s / TD.RISE)); }
    else if (s < TD.RISE + TD.HANG) vz = TD.H + 12 * Math.sin((s - TD.RISE) / TD.HANG * Math.PI);
    else { const u = clamp((s - TD.RISE - TD.HANG) / TD.FALL, 0, 1); vz = lerp(TD.H, i === 2 ? 0 : 50, easeIn(u)); vx = lerp(bx, nx, u); vy = lerp(by, ny, u); }
    put(c, tw, vx, vy, vz); pose(c, tw, 'tumble');
    if (ev(E)) {
      // 踢起（第一趟是起手那一脚，之后是落地前接住那一脚）
      hit(c, tw, K.hit, 'tiandi'); hitFx(c, tw, -Math.PI / 2, 1.8); burst({ x: bx, y: by, z: z0 + 40 }, -Math.PI / 2, 1.4);   // IMPACT: 背后冲击波
      c.shake(0.2); audio.sfx('whoosh', bx, by);
      c.data.fall = c.data.fall ?? hs2add('falls', { who: tw as Hs2Who, on: true, hot: 0.4 } as Hs2Fall);
    }
    // 他：踢完跟上去（瞬移到它头顶），砸下来，再瞬移回地面接住
    if (s >= 0.18 && s < TD.RISE + TD.HANG && ev(E + 1)) {
      const from = pos(c, uw), to = { x: bx - 30, y: by - 10, z: TD.H + 90 };
      blink(from, to); put(c, uw, to.x, to.y, to.z); pose(c, uw, 'hsHammer', true); ghost(c, uw);   // IMPACT: 超高速追击线
      airRing({ x: to.x, y: to.y, z: to.z - 10 });   // IMPACT: 踏空气环
    }
    if (s >= TD.RISE + TD.HANG && ev(E + 2)) {
      hit(c, tw, K.hit, 'tiandi'); hitFx(c, tw, Math.PI / 2, 2); burst({ x: bx, y: by, z: TD.H }, Math.PI / 2, 1.8);   // IMPACT: 背后冲击波
      c.data.trips = i + 1; c.shake(0.25); audio.sfx('boom', bx, by);
      if (i === 2) { const fl = c.data.fall as Hs2Fall | undefined; if (fl) fl.hot = 1; }
    }
    if (s >= TD.RISE + TD.HANG + 0.03 && i < 2 && ev(E + 3)) {
      const from = pos(c, uw), to = { x: nx - c.dirX * 70, y: ny - c.dirY * 56, z: 0 };
      blink(from, to); put(c, uw, to.x, to.y, 0); face(c, uw, nx - to.x, ny - to.y); pose(c, uw, 'hsKick'); ghost(c, uw);   // IMPACT: 超高速追击线
    }
    if (i < 2 && s >= TD.RISE + TD.HANG + 0.12 && (c.data.kicked as number | undefined) !== i) { c.data.kicked = i; pose(c, uw, 'hsKick', true); }
    // 他在半空：砸完跟着往下落一截
    if (s >= TD.RISE + TD.HANG && (i === 2 || s < TD.RISE + TD.HANG + 0.03)) { const q = pos(c, uw); if (q.z > 0) put(c, uw, lerp(q.x, vx - 30, 0.3), lerp(q.y, vy - 10, 0.3), Math.max(vz + 90, 0)); }
    // 最后一趟砸进地里
    if (i === 2 && s >= TD.RISE + TD.HANG + TD.FALL && !c.data.fin) {
      c.data.fin = 1; c.data.tf = T;
      const g = gOf(c), q = { x: nx, y: ny, z: 0 };
      hit(c, tw, K.fin, 'tiandi-fin');
      c.fx({ k: 'meteor', x: q.x, y: q.y, power: 2.8, r: 260 });
      try { g.combat.wreck.radial(q.x, q.y, 320, 3.4, uw, { mark: 'pit' }); } catch { /* 破坏系统出错不拖垮出招 */ }
      inkFlash(c, q, 1.3);   // IMPACT: 黑白闪
      closeUp(c, 1.1);   // IMPACT: 定格特写
      g.juice(0.11, 0.8); audio.sfx('boom', q.x, q.y); audio.sfx('thunder', q.x, q.y);
      const fl = c.data.fall as Hs2Fall | undefined; if (fl) fl.on = false;
      drop(c, tw, 1.3);
      finisher(c, '天地往返');
    }
    if (c.data.fin) {
      const k2 = clamp((T - (c.data.tf as number)) / 0.22, 0, 1), q = pos(c, uw);
      put(c, uw, q.x, q.y, q.z * (1 - k2)); if (k2 >= 1) pose(c, uw, 'idle');
      return T < (c.data.tf as number) + 0.5;
    }
    return true;
  },
  end(c) { endAll(c); },
};

// ------------------------------------------------------------------ 5. 点穴延爆
const DX = { POKES: 7, GAP: 0.075, WALK: 0.55, DELAY: 2.2, CHAIN: 0.1 };
const DIANXUE: SpecialMove = {
  id: 'dianxue', name: '点穴延爆', glyph: '穴', desc: '连点七处大穴，转身就走；几息之后，对手身上一处接一处炸开。', who: 'npc', cd: 14, range: 380,
  can: (_B, u) => !!u && u === HS?.ent,
  begin(c) {
    if (!needFoe(c)) return false;
    callName(c, 'dianxue');
    c.data.n = 0; c.data.pop = 0; c.data.marks = [];
    return true;
  },
  tick(c) {
    const tw = c.target!, uw = uW(c), K = HS2K.dianxue, T = c.t, g = gOf(c);
    if (gone(c, tw) || stood(c)) return false;
    syncP(c); holdP(c);
    if (!c.data.go) {
      c.data.go = 1; closeIn(c, tw, 80); seize(c, tw);
      const u = pos(c, uw), t = pos(c, tw); c.data.dir = Math.atan2(t.y - u.y, t.x - u.x); c.data.tx = t.x; c.data.ty = t.y;
      face(c, uw, t.x - u.x, t.y - u.y); face(c, tw, u.x - t.x, u.y - t.y); pose(c, uw, 'hsPoke', true);
    }
    const dir = c.data.dir as number, ux = Math.cos(dir), uy = Math.sin(dir);
    if (held(c, tw)) { put(c, tw, c.data.tx as number, c.data.ty as number, 0); pose(c, tw, 'hit'); }
    // 连点七下：每一下在身上留一个发光的穴位
    const n = Math.min(DX.POKES, Math.floor(T / DX.GAP) + 1);
    while ((c.data.n as number) < n) {
      const i = c.data.n as number; c.data.n = i + 1;
      const s = hash32(i, 0xd1a);
      const m = hs2add('marks', { who: tw as Hs2Who, ox: ((s & 15) - 7.5) * 3.2, oz: 38 + ((s >> 4) % 70), t0: g.time, boom: 0, done: false });
      (c.data.marks as unknown[]).push(m);
      hit(c, tw, K.poke, 'dianxue-poke');
      const t = pos(c, tw); hs2fx({ k: 'poke', x: t.x + m.ox, y: t.y, z: m.oz, dir });
      audio.sfx('clang', t.x, t.y);
    }
    const T1 = DX.POKES * DX.GAP + 0.08;
    // 转身就走：背对着它走两步，站定
    if (T >= T1) {
      if (!c.data.turned) { c.data.turned = 1; c.data.wx = pos(c, uw).x; c.data.wy = pos(c, uw).y; face(c, uw, -ux, -uy); pose(c, uw, 'walk'); c.B.combat.texts.push({ x: (c.data.wx as number), y: (c.data.wy as number) - 170, s: '……三息。', color: '#ffe0a0', t: 0, vy: -10 } as never); }
      const k = clamp((T - T1) / DX.WALK, 0, 1);
      put(c, uw, (c.data.wx as number) - ux * 170 * k, (c.data.wy as number) - uy * 136 * k, 0);
      if (uw !== 'p' && uw.cs) uw.cs.speed = k < 1 ? 160 : 0;
      if (k >= 1) pose(c, uw, 'idle');
    }
    // 几息后：一处接一处炸开
    const TB = T1 + DX.DELAY, marks = c.data.marks as { ox: number; oz: number; boom: number; done: boolean }[];
    for (const m of marks) if (!m.boom) m.boom = g.time + (TB - T) + marks.indexOf(m) * DX.CHAIN;
    if (T >= TB) {
      const k = Math.min(marks.length, Math.floor((T - TB) / DX.CHAIN) + 1);
      while ((c.data.pop as number) < k) {
        const i = c.data.pop as number; c.data.pop = i + 1;
        const m = marks[i]; m.done = true;
        const t = pos(c, tw), last = i === marks.length - 1;
        // r7-fix：最后一处原来炸出一大团橙白的光（pop 2 + 冲击波 2 + 贯穿光柱的爆芒）——照犁地甩出的改法收到人周围、0.4 息内散掉
        hs2fx({ k: 'pop', x: t.x + m.ox, y: t.y, z: t.z + m.oz, p: last ? 1.4 : 1 });
        burst({ x: t.x, y: t.y, z: t.z + m.oz }, dir, last ? 0.9 : 0.8);   // IMPACT: 背后冲击波
        if (!last) { hit(c, tw, K.pop, 'dianxue-pop'); if (held(c, tw)) pose(c, tw, 'hit', true); c.shake(0.15); audio.sfx('boom', t.x, t.y); }
        else {
          hit(c, tw, K.fin, 'dianxue-fin');
          inkFlash(c, t, 1);   // IMPACT: 黑白闪
          c.fx({ k: 'launch', anchor: { x: t.x, y: t.y, offsetY: -t.z }, x: t.x, y: t.y - 60, color: '255,150,90', power: 1.2, dir });
          fling(c, tw, ux, uy, 1000, 640);
          g.juice(0.08, 0.6); c.cam(1.1); audio.sfx('thunder', t.x, t.y);   // r7-polish：收尾一击镜头猛推
          finisher(c, '点穴延爆');
        }
      }
      return T < TB + marks.length * DX.CHAIN + 0.4;
    }
    return true;
  },
  end(c) { endAll(c); for (const m of (c.data.marks as { done: boolean }[] | undefined) ?? []) m.done = true; },
};

// ------------------------------------------------------------------ 6. 犁地（用户点名：按着头一路犁过去）
const LD = { IN: 0.14, SLAM: 0.2, GO: 0.42, MAX: 1800, MIN: 260, V0: 700, V1: 1450, ACC: 0.22, SEG: 140, GRIND: 0.15, HEAD: 30, HAND: 62, SIDE: 18 };
const LIDI: SpecialMove = {
  id: 'lidi', name: '犁地', glyph: '犁', desc: '扣住对手的头按进地里，按着不松手往前狂奔，一路犁出一道沟、撞碎沿途的石头树木，最后甩出去。被抓的可以连按挣脱。', who: 'both', realm: 3, mp: 0.12, cd: 10, range: 460, color: '230,170,110',
  can: (_B, u) => !u || u === HS?.ent,
  begin(c) {
    if (!needFoe(c)) return false;
    const tw = c.target!;
    if (!grabbable(c.B, tw)) { if (isPU(c)) gOf(c).toast('这家伙太大了（或是首领），按不住它的头。', 'info'); return false; }
    // 往哪犁：朝对手那一边，左右各试几个角度，挑能跑最远的（犁到水边 / 崖边就把它甩下去）
    const u = pos(c, uW(c)), t = pos(c, tw), a0 = Math.atan2(t.y - u.y, t.x - u.x);
    let best = { a: a0, L: -1, stop: 'ok' as 'ok' | 'water' | 'wall' };
    for (const da of [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05]) {
      const a = a0 + da, ux = Math.cos(a), uy = Math.sin(a);
      let L = 0, stop: 'ok' | 'water' | 'wall' = 'ok', px = t.x, py = t.y;
      for (let d = 30; d <= LD.MAX; d += 30) {
        const x = t.x + ux * d, y = t.y + uy * d * 0.8;
        if (c.B.deepWater(x, y)) { stop = 'water'; break; }
        if (!passable(c, px, py, x, y)) { stop = 'wall'; break; }
        L = d; px = x; py = y;
      }
      if (L > best.L + 120 || (best.L < 0)) best = { a, L, stop };
      if (L >= LD.MAX) break;
    }
    c.data.a = best.a; c.data.L = Math.max(LD.MIN, best.L); c.data.stop = best.L < LD.MAX ? best.stop : 'ok';
    c.data.went = 0; c.data.segAt = 0; c.data.grindT = 0; c.data.rocks = 0; c.data.trees = 0; c.data.lines = 0;
    callName(c, 'lidi');
    return true;
  },
  tick(c, dt) {
    const tw = c.target!, uw = uW(c), K = HS2K.lidi, pu = isPU(c), g = gOf(c), T = c.t;
    if (gone(c, tw) || stood(c)) return false;
    syncP(c); holdP(c);
    const a = c.data.a as number, ux = Math.cos(a), uy = Math.sin(a) * 0.8, ul = Math.hypot(ux, uy), fx = ux / ul, fy = uy / ul;
    const sx = -fy, sy = fx;   // 右手一侧
    // 0) 扑上去、伸手
    if (!c.data.in) { c.data.in = 1; closeIn(c, tw, 70); const q = pos(c, uw), t = pos(c, tw); face(c, uw, t.x - q.x, t.y - q.y); pose(c, uw, 'grab', true); audio.sfx('whoosh', q.x, q.y); }
    if (T < LD.IN) return true;
    // 1) 扣住头按进地里
    if (!c.data.grab) {
      c.data.grab = 1;
      if (!seize(c, tw)) return false;
      const u = pos(c, uw);
      c.data.x = u.x; c.data.y = u.y;
      pose(c, uw, 'hsDrag', true); pose(c, tw, 'hsDragged', true);
      face(c, uw, fx, fy); face(c, tw, fx, fy);
    }
    // 拖行中的位置：他在 (x, y)，它的头在他右手前下方，身子往后拖
    const X = c.data.x as number, Y = c.data.y as number;
    const hx = X + fx * LD.HAND + sx * LD.SIDE, hy = Y + fy * LD.HAND + sy * LD.SIDE;
    put(c, uw, X, Y, 0); put(c, tw, hx - fx * LD.HEAD, hy - fy * LD.HEAD, 0);
    face(c, uw, fx, fy); face(c, tw, fx, fy);
    if (c.data.escaped) return T < (c.data.escT as number) + 0.35;
    if (escTick(c, 'lidi')) { c.data.escT = T; const d = c.data.drag as Hs2Drag | undefined; if (d) d.on = false; pose(c, uw, 'hit', true); return true; }
    if (T >= LD.SLAM && !c.data.slam) {
      c.data.slam = 1;
      hit(c, tw, pu ? K.pSlam : K.slam, 'lidi-slam');
      c.fx({ k: 'crater', x: hx, y: hy, power: 2, r: 120, dir: a });
      hs2fx({ k: 'slamdirt', x: hx, y: hy, dir: a, rock: rocky(c, hx, hy) });
      try { g.combat.wreck.radial(hx, hy, 150, 1.6, uw, { mark: 'pit', shake: false }); } catch { /* 破坏系统出错不拖垮出招 */ }
      inkFlash(c, { x: hx, y: hy, z: 0 }, 0.8);   // IMPACT: 黑白闪
      g.juice(0.09, 0.6); c.cam(0.9); audio.sfx('boom', hx, hy);
    }
    if (T < LD.GO) return true;
    // 2) 按着头往前狂奔
    const L = c.data.L as number, went = c.data.went as number;
    if (!c.data.drag) {
      c.data.drag = hs2add('drags', { user: uw as Hs2Who, who: tw as Hs2Who, dir: a, rock: rocky(c, hx, hy), sp: 0, on: true, t0: g.time } as Hs2Drag);
      c.data.hx0 = hx; c.data.hy0 = hy;
    }
    const D = c.data.drag as Hs2Drag;
    if (went < L) {
      const v = lerp(LD.V0, LD.V1, ease((T - LD.GO) / LD.ACC)), step = Math.min(L - went, v * dt);
      // 路上被谁挡住了（地形变了 / 后来摆了东西）：提前收住
      const nx = X + fx * step, ny = Y + fy * step;
      if (!passable(c, X, Y, nx, ny) && !c.B.deepWater(nx, ny)) { c.data.L = went; }
      else { c.data.x = nx; c.data.y = ny; c.data.went = went + step; }
      D.sp = v; D.dir = a;
      if (((c.data.rk as number | undefined) ?? 0) <= 0) { D.rock = rocky(c, hx, hy); c.data.rk = 0.25; } else c.data.rk = (c.data.rk as number) - dt;
      // 沿途犁沟：每跑一段调一次破坏系统的直线（沟从它的头那里开始）
      const segFrom = c.data.segAt as number;
      if ((c.data.went as number) - segFrom >= LD.SEG || (c.data.went as number) >= (c.data.L as number)) {
        const s0 = { x: (c.data.hx0 as number) + fx * segFrom, y: (c.data.hy0 as number) + fy * segFrom }, s1 = { x: (c.data.hx0 as number) + fx * (c.data.went as number), y: (c.data.hy0 as number) + fy * (c.data.went as number) };
        c.data.segAt = c.data.went;
        try {
          const r = g.combat.wreck.line(s0.x, s0.y, s1.x, s1.y, 90, 2.4, uw, { shake: false });
          c.data.lines = (c.data.lines as number) + 1;
          if (r.trees > 0) { c.data.trees = (c.data.trees as number) + r.trees; hit(c, tw, (pu ? K.pRock : K.rock) * 0.6, 'lidi-tree'); g.juice(0.04, 0.3); hs2fx({ k: 'grind', x: s1.x, y: s1.y, dir: a, p: 1 }); }
        } catch { /* 破坏系统出错不拖垮出招 */ }
      }
      // 撞上石头 / 枯树 / 船骸：撞碎，顿一下，它掉一截血
      const brk = c.B.brk, rk = brk.n > 0 ? brk.hit(hx + fx * 20, hy + fy * 20, 0, 44) : null;
      if (rk && !rk.dead) {
        brk.smash(rk, a, 2.6); c.data.rocks = (c.data.rocks as number) + 1;
        hit(c, tw, pu ? K.pRock : K.rock, 'lidi-rock');
        c.fx({ k: 'rubble', x: rk.x, y: rk.y, r: rk.r, dir: a, power: 2.4, kind: rk.kind });
        hs2fx({ k: 'grind', x: rk.x, y: rk.y, dir: a, p: 2, rock: true });
        g.juice(0.07, 0.45); audio.sfx('boom', rk.x, rk.y);
      }
      // 一路磨：每 0.15 息掉一点血
      c.data.grindT = (c.data.grindT as number) - dt;
      if ((c.data.grindT as number) <= 0) { c.data.grindT = LD.GRIND; hit(c, tw, pu ? K.pGrind : K.grind, 'lidi-grind'); c.shake(0.06); }
      c.data.gT = ((c.data.gT as number | undefined) ?? 0) - dt;
      if ((c.data.gT as number) <= 0) { c.data.gT = 0.07; ghost(c, uw, '255,200,140', 0.24); }
      if ((c.data.went as number) < (c.data.L as number)) return true;
      c.data.tEnd = T;
    }
    // 3) 跑到头：往前一甩（前面是水就砸进水里，是崖壁就撞上去）
    D.on = false; D.sp = 0;
    const tE = c.data.tEnd as number;
    if (!c.data.throwPose) { c.data.throwPose = 1; pose(c, uw, 'hsHurl', true); escHide(); }
    if (T >= tE + 0.12 && !c.data.fin) {
      c.data.fin = 1;
      const t = pos(c, tw), water = c.data.stop === 'water';
      put(c, tw, t.x, t.y, 40);
      hit(c, tw, pu ? K.pFin : K.fin, 'lidi-fin');
      // r7-polish：甩出那一下原来炸出一大团橙白的光（power 2.2 + 贯穿光柱的爆芒）盖住半屏——收到人周围、0.3 息内散掉
      c.fx({ k: 'launch', anchor: { x: t.x, y: t.y, offsetY: -40 }, x: t.x, y: t.y - 60, color: '255,180,110', power: 1.2, dir: a });
      burst({ x: t.x, y: t.y, z: 40 }, a, 0.9);   // IMPACT: 背后冲击波
      fling(c, tw, Math.cos(a), Math.sin(a), water ? 900 : 1150, water ? 950 : 560);
      g.juice(0.08, 0.55); c.cam(1.1); audio.sfx('boom', t.x, t.y);
      finisher(c, '犁地');
    }
    if (c.data.fin && T >= tE + 0.2) pose(c, uw, 'idle');
    return T < tE + 0.55;
  },
  end(c) { endAll(c); },
};
/** 地面是石头还是泥（犁地喷火星还是喷泥） */
function rocky(c: MoveCtx, x: number, y: number): boolean {
  const g = gOf(c);
  if (g.mijing?.active || g.xukong?.fight?.on) return true;
  try { const s = g.terrain.sample(x, y); return s.elev > 0.45 || s.arid > 0.55 || s.cold > 0.7; } catch { return false; }
}

// ------------------------------------------------------------------ 7. 抡人为棍
const LR = { IN: 0.16, SPIN: 1.15, REVS: 2.6, R: 96, HIT: 200 };
/** 他抡人时会砸的人：冲他来的（妖兽、跟他有仇的、打他的），惹怒他时连你也砸 */
function rivals(c: MoveCtx): W[] {
  const out: W[] = [], u = c.user, me = uW(c), tg = c.target;
  for (const o of c.B.combat.enemies) {
    if (o === u || o === tg || o.dead || o.gone || o.hideT > 0) continue;
    if (u) { if (!(o.aggro && (o.tgE === u || o.grudge === u || o.tankRef === u || o === HS?.beast || (o.def.kind !== 'human' && !(o as { noP?: boolean }).noP)))) continue; }
    else if (!o.aggro || (o as { noP?: boolean }).noP || o.spar) continue;
    out.push(o);
  }
  if (u && me !== 'p' && tg !== 'p' && HS?.mode === 'angry') out.push('p');
  return out;
}
const LUNREN: SpecialMove = {
  id: 'lunren', name: '抡人为棍', glyph: '抡', desc: '攥住一个敌人的脚踝当兵器抡起来，砸翻身边的人，再整个扔出去。', who: 'npc', cd: 12, range: 380,
  can: (_B, u) => !!u && u === HS?.ent,
  begin(c) {
    if (!needFoe(c) || !grabbable(c.B, c.target)) return false;
    callName(c, 'lunren');
    c.data.bashed = new Set<W>(); c.data.bash = 0;
    return true;
  },
  tick(c) {
    const tw = c.target!, uw = uW(c), K = HS2K.lunren, T = c.t, g = gOf(c);
    if (gone(c, tw) || stood(c)) return false;
    syncP(c); holdP(c);
    if (!c.data.in) { c.data.in = 1; closeIn(c, tw, 80); const q = pos(c, uw), t = pos(c, tw); face(c, uw, t.x - q.x, t.y - q.y); pose(c, uw, 'grab', true); }
    if (T < LR.IN) return true;
    const u = pos(c, uw);
    if (!c.data.grab) {
      c.data.grab = 1;
      if (!seize(c, tw)) return false;
      const t = pos(c, tw); c.data.a0 = Math.atan2(t.y - u.y, t.x - u.x);
      hit(c, tw, K.grab, 'lunren-grab'); hitFx(c, tw, c.data.a0 as number, 1);
      pose(c, uw, 'hsSwing', true); pose(c, tw, 'hsSwung', true);
      c.data.spin = hs2add('spins', { user: uw as Hs2Who, r: LR.R + 70, on: true } as Hs2Spin);
      try { g.combat.wreck.radial(u.x, u.y, 230, 0.7, uw, { mark: 'none', shake: false }); } catch { /* 破坏系统出错不拖垮出招 */ }
      audio.sfx('whoosh', u.x, u.y);
    }
    if (c.data.escaped) return T < (c.data.escT as number) + 0.35;
    if (escTick(c, 'lunren')) { c.data.escT = T; const s = c.data.spin as Hs2Spin | undefined; if (s) s.on = false; pose(c, uw, 'hit', true); return true; }
    const s = clamp((T - LR.IN) / LR.SPIN, 0, 1);
    // 越转越快：角度按 s² 走（最后一圈最快）
    const ang = (c.data.a0 as number) + TAU * LR.REVS * (0.35 * s + 0.65 * s * s);
    const ox = Math.cos(ang), oy = Math.sin(ang) * 0.8;
    const vx = u.x + ox * LR.R, vy = u.y + oy * LR.R, vz = 40 + 18 * Math.sin(ang * 2);
    if (!c.data.fin) {
      put(c, tw, vx, vy, vz); face(c, tw, ox, oy); face(c, uw, ox, oy);
      // 甩到的人
      for (const o of rivals(c)) {
        if ((c.data.bashed as Set<W>).has(o)) continue;
        const q = pos(c, o), d = Math.hypot(q.x - vx, q.y - vy), d2 = Math.hypot(q.x - u.x, q.y - u.y);
        if (d > 120 && d2 > LR.HIT + 40) continue;
        if (d2 > LR.HIT + 60) continue;
        (c.data.bashed as Set<W>).add(o); c.data.bash = (c.data.bash as number) + 1;
        const tx = -oy, ty = ox, dir = Math.atan2(q.y - u.y, q.x - u.x);
        hit(c, o, K.bash, 'lunren-bash'); hit(c, tw, K.self, 'lunren-self');
        c.fx({ k: 'bxhit', anchor: { x: q.x, y: q.y, offsetY: -q.z }, x: q.x, y: q.y - 60, color: '255,180,110', power: 2.4, dir, r: 6 });
        hs2fx({ k: 'swing', x: q.x, y: q.y, z: 50, dir });
        if (o === 'p') c.launch('p', Math.cos(dir) + tx * 0.3, Math.sin(dir) + ty * 0.3, 900, 340); else c.launch(o, Math.cos(dir) + tx * 0.3, Math.sin(dir) + ty * 0.3, 900, 340);
        g.juice(0.06, 0.4); audio.sfx('boom', q.x, q.y);
      }
      // 甩到的石头
      for (const rk of c.B.brk.near(vx, vy, 90)) { if (rk.dead || Math.hypot(rk.x - vx, rk.y - vy) > rk.r + 50) continue; c.B.brk.smash(rk, ang + Math.PI / 2, 2); c.fx({ k: 'rubble', x: rk.x, y: rk.y, r: rk.r, dir: ang, power: 2, kind: rk.kind }); hit(c, tw, K.self * 0.5, 'lunren-rock'); }
    }
    if (s >= 1 && !c.data.fin) {
      // 扔出去：朝原来对手的方向（有冲他来的人就朝最近的那个）
      c.data.fin = 1; c.data.tf = T;
      let dir = c.data.a0 as number, bd = 1e9;
      for (const o of rivals(c)) { if ((c.data.bashed as Set<W>).has(o)) continue; const q = pos(c, o), d = Math.hypot(q.x - u.x, q.y - u.y); if (d < bd && d < 1400) { bd = d; dir = Math.atan2(q.y - u.y, q.x - u.x); } }
      put(c, tw, u.x + Math.cos(dir) * LR.R, u.y + Math.sin(dir) * LR.R * 0.8, 50);
      const t = pos(c, tw);
      hit(c, tw, K.fin, 'lunren-fin');
      c.fx({ k: 'launch', anchor: { x: t.x, y: t.y, offsetY: -50 }, x: t.x, y: t.y - 60, color: '255,190,120', power: 2.2, dir, r: 1 });
      burst({ x: t.x, y: t.y, z: 50 }, dir, 1.6);   // IMPACT: 背后冲击波
      fling(c, tw, Math.cos(dir), Math.sin(dir), 1500, 420);
      pose(c, uw, 'hsHurl', true); face(c, uw, Math.cos(dir), Math.sin(dir));
      const sp = c.data.spin as Hs2Spin | undefined; if (sp) sp.on = false;
      escHide();
      g.juice(0.07, 0.5); c.cam(1); audio.sfx('boom', t.x, t.y);
      finisher(c, '抡人为棍');
    }
    if (c.data.fin) return T < (c.data.tf as number) + 0.45;
    return true;
  },
  end(c) { endAll(c); },
};

// ------------------------------------------------------------------ 8. 陨星坠
const YX = { IN: 0.14, UP: 0.55, FLIP: 0.2, DOWN: 0.3, H: 900 };
const YUNXING: SpecialMove = {
  id: 'yunxing', name: '陨星坠', glyph: '陨', desc: '抱住对手跃上高空，翻过来倒栽着砸下去，砸出一个大坑。', who: 'npc', cd: 16, range: 380,
  can: (_B, u) => !!u && u === HS?.ent,
  begin(c) {
    if (!needFoe(c) || !grabbable(c.B, c.target)) return false;
    const t = pos(c, c.target!);
    if (c.B.deepWater(t.x, t.y)) return false;   // 落点要在地上（海边换别的招）
    callName(c, 'yunxing');
    c.data.X = t.x; c.data.Y = t.y;
    return true;
  },
  tick(c) {
    const tw = c.target!, uw = uW(c), K = HS2K.yunxing, T = c.t, g = gOf(c);
    if (gone(c, tw) || stood(c)) return false;
    syncP(c); holdP(c);
    const X = c.data.X as number, Y = c.data.Y as number;
    if (!c.data.in) { c.data.in = 1; closeIn(c, tw, 60); const q = pos(c, uw); face(c, uw, X - q.x, Y - q.y); pose(c, uw, 'grab', true); }
    if (T < YX.IN) return true;
    if (!c.data.grab) {
      c.data.grab = 1;
      if (!seize(c, tw)) return false;
      const q = pos(c, uw); c.data.ux = q.x; c.data.uy = q.y;
      hit(c, tw, K.grab, 'yunxing-grab');
      pose(c, uw, 'hsHug', true); pose(c, tw, 'hit', true);
      // 起跳：脚下炸开一圈、地面龟裂
      airRing({ x: q.x, y: q.y, z: 0 });   // IMPACT: 踏空气环
      hs2fx({ k: 'lift', x: q.x, y: q.y, p: 1.4 });
      try { g.combat.wreck.radial(q.x, q.y, 200, 1.2, uw, { mark: 'crack', shake: false }); } catch { /* 破坏系统出错不拖垮出招 */ }
      g.juice(0.04, 0.4); audio.sfx('boom', q.x, q.y);
    }
    if (c.data.escaped) return T < (c.data.escT as number) + 0.35;
    if (escTick(c, 'yunxing')) { c.data.escT = T; const q = pos(c, uw); put(c, uw, q.x, q.y, 0); pose(c, uw, 'hit', true); return true; }
    const UX = c.data.ux as number, UY = c.data.uy as number, mx = (UX + X) / 2, my = (UY + Y) / 2;
    const s = T - YX.IN;
    if (s < YX.UP) {
      const z = YX.H * easeOut(s / YX.UP);
      put(c, uw, UX, UY, z); put(c, tw, X, Y, z + 6);
      if (((c.data.gT as number | undefined) ?? 0) <= 0) { c.data.gT = 0.06; ghost(c, uw, '255,220,160', 0.25); } else c.data.gT = (c.data.gT as number) - 1 / 60;
      return true;
    }
    if (s < YX.UP + YX.FLIP) {
      // 在顶上翻过来：他在上，它头朝下
      const k = ease((s - YX.UP) / YX.FLIP);
      if (!c.data.flip) { c.data.flip = 1; pose(c, uw, 'hsPlunge', true); pose(c, tw, 'hsInvert', true); airRing({ x: mx, y: my, z: YX.H + 120 }); }   // IMPACT: 踏空气环
      put(c, uw, lerp(UX, mx, k), lerp(UY, my, k) - 4, YX.H + 40 * k); put(c, tw, lerp(X, mx, k), lerp(Y, my, k), YX.H - 70 * k);
      return true;
    }
    const u = clamp((s - YX.UP - YX.FLIP) / YX.DOWN, 0, 1);
    if (!c.data.fin) {
      if (!c.data.fall) c.data.fall = hs2add('falls', { who: tw as Hs2Who, on: true, hot: 1 } as Hs2Fall);
      const z = lerp(YX.H - 70, 0, easeIn(u));
      put(c, tw, mx, my, z); put(c, uw, mx, my - 4, z + 110);
      if (u < 1) return true;
      // 落地
      c.data.fin = 1; c.data.tf = T;
      const q = { x: mx, y: my, z: 0 };
      hit(c, tw, K.fin, 'yunxing-fin');
      c.fx({ k: 'meteor', x: q.x, y: q.y, power: 3.4, r: 360, big: true });
      hs2fx({ k: 'plunge', x: q.x, y: q.y, p: 1.6 });
      try { g.combat.wreck.radial(q.x, q.y, 420, 4.2, uw, { mark: 'pit' }); } catch { /* 破坏系统出错不拖垮出招 */ }
      inkFlash(c, q, 1.6);   // IMPACT: 黑白闪
      closeUp(c, 1.3);   // IMPACT: 定格特写
      g.juice(0.12, 0.95); audio.sfx('boom', q.x, q.y); audio.sfx('thunder', q.x, q.y);
      const fl = c.data.fall as Hs2Fall; fl.on = false;
      // 周围的人被震开（不伤，只推：和近战砸地一样）
      for (const o of c.B.combat.enemies) { if (o === tw || o === c.user || o.dead || !c.B.launchable(o)) continue; const d = Math.hypot(o.x - q.x, o.y - q.y); if (d < 420 && d > 1) { o.kx += (o.x - q.x) / d * 420; o.ky += (o.y - q.y) / d * 300; } }
      drop(c, tw, 1.5); pose(c, tw, 'hit');
      finisher(c, '陨星坠');
      escHide();
    }
    // 他从它身上一蹬，后空翻落到一边
    const k2 = clamp((T - (c.data.tf as number)) / 0.35, 0, 1);
    if (k2 < 1) { put(c, uw, mx - c.dirX * 170 * k2, my - c.dirY * 130 * k2, 110 * (1 - k2) + 90 * Math.sin(Math.PI * k2)); pose(c, uw, 'tumble'); }
    else { const q = pos(c, uw); put(c, uw, q.x, q.y, 0); pose(c, uw, 'idle'); }
    return T < (c.data.tf as number) + 0.5;
  },
  end(c) { endAll(c); },
};

// ------------------------------------------------------------------ 9. 掷山
const ZS = { WALK: 0.25, LIFT: 0.55, HOLD: 0.3 };
const ZHISHAN: SpecialMove = {
  id: 'zhishan', name: '掷山', glyph: '山', desc: '拔起路边的巨石或断树，隔着老远砸过来。', who: 'npc', cd: 14, range: 1500,
  can: (_B, u) => !!u && u === HS?.ent,
  begin(c) {
    if (!needFoe(c)) return false;
    const g = gOf(c), u = pos(c, uW(c));
    // 身边有石头 / 树就拔它；没有就一跺脚从地里掀起一块（摆一块巨石再拔）
    let cr = null as ReturnType<typeof g.combat.wreck.uproot>;
    try { cr = g.combat.wreck.uproot(u.x, u.y, 420, 'any'); } catch { cr = null; }
    if (!cr) {
      const nx = -c.dirY, ny = c.dirX, bx = u.x + nx * 120 - c.dirX * 40, by = u.y + ny * 96 - c.dirY * 30;
      if (!walkable(c, bx, by)) return false;
      try { c.B.brk.place('boulder', bx, by, 0.9, hash32(Math.round(bx), Math.round(by)) & 3); cr = g.combat.wreck.uproot(bx, by, 160, 'rock'); } catch { cr = null; }
      if (cr) c.fx({ k: 'crater', x: bx, y: by, power: 2, r: 120, dir: 0 });
    }
    if (!cr) return false;
    callName(c, 'zhishan');
    c.data.cr = cr; c.data.sx = u.x; c.data.sy = u.y;
    return true;
  },
  tick(c) {
    const uw = uW(c), tw = c.target!, T = c.t, g = gOf(c), W2 = g.combat.wreck;
    if (stood(c)) return false;
    const cr = c.data.cr as NonNullable<ReturnType<typeof W2.uproot>>;
    // 走到石头边上
    if (T < ZS.WALK) {
      const k = ease(T / ZS.WALK), dx = cr.x - (c.data.sx as number), dy = cr.y - (c.data.sy as number), L = Math.hypot(dx, dy) || 1, stop = Math.max(0, L - 70);
      put(c, uw, (c.data.sx as number) + dx / L * stop * k, (c.data.sy as number) + dy / L * stop * k, 0);
      face(c, uw, dx, dy); pose(c, uw, k < 1 ? 'rush' : 'hsLift');
      return true;
    }
    const u = pos(c, uw);
    if (!c.data.lift) { c.data.lift = 1; pose(c, uw, 'hsLift', true); hs2fx({ k: 'lift', x: cr.x, y: cr.y, p: 1 }); g.juice(0.03, 0.3); audio.sfx('break', cr.x, cr.y); }
    const t = gone(c, tw) ? null : pos(c, tw);
    if (t) face(c, uw, t.x - u.x, t.y - u.y);
    if (T < ZS.WALK + ZS.LIFT + ZS.HOLD) {
      const k = ease((T - ZS.WALK) / ZS.LIFT);
      if (k >= 0.35) W2.hold(cr, u.x, u.y - 6, lerp(cr.size * 0.6, 150 + cr.size * 0.5, k), Math.sin(T * 7) * 0.04);
      return true;
    }
    if (!c.data.thrown) {
      c.data.thrown = 1;
      pose(c, uw, 'hsHurl', true);
      const tx = t ? t.x : u.x + c.dirX * 900, ty = t ? t.y : u.y + c.dirY * 720;
      const me = c.user, tgt = tw, K = HS2K.zhishan;
      W2.hurl(cr, u.x, u.y, tx, ty, {
        speed: 1700, arc: 0.2, power: 3.6, radius: 300, src: uw,
        onLand: (r) => {
          // 落地：受波及的人里，是它的对手（打的那个、冲他来的）的才打（中立：路人不算）
          for (const h of r.units) {
            const who: W | null = h.player ? 'p' : h.e;
            if (!who) continue;
            const ok = who === tgt || (who !== 'p' && !!me && (who.tgE === me || who.grudge === me || who === HS?.beast)) || (who === 'p' && HS?.mode === 'angry');
            if (!ok) continue;
            c.hit(who, K.fin * (0.5 + 0.5 * h.k), 'hs2-zhishan');
            if (who === 'p') c.B.launchPlayer(h.ux, h.uy, 500, 420, me); else if (c.B.launchable(who)) c.B.launch(who, h.ux, h.uy, 650, 420, me ?? 'p', me?.realm ?? g.hero.realm, me?.atk ?? c.B.patk, false);
          }
          c.data.landed = 1;
          inkFlash(c, { x: tx, y: ty, z: 0 }, 0.9);   // IMPACT: 黑白闪
          c.cam(1);   // r7-polish：砸中那一下镜头猛推
        },
      });
      c.data.tf = T;
      audio.sfx('whoosh', u.x, u.y);
    }
    return T < (c.data.tf as number) + 0.45;
  },
  end(c) {
    endAll(c);
    // 被打断时还拿在手里：掉在脚下
    const cr = c.data.cr as { st: string } | undefined, g = gOf(c);
    if (cr && (cr.st === 'held' || cr.st === 'lift') && !c.data.thrown) { const u = pos(c, uW(c)); try { g.combat.wreck.hurl(cr as never, u.x, u.y, u.x + 1, u.y, { speed: 400, arc: 0, power: 1 }); } catch { /* 破坏系统出错不拖垮出招 */ } }
  },
};

const ALL = [LIUXING, YANHUI, SHIFANG, TIANDI, DIANXUE, LIDI, LUNREN, YUNXING, ZHISHAN];

// ------------------------------------------------------------------ 接进他和你
/**
 * 撼山客构造时调一次：九招注册进近战的特殊招式表（registerMove），并挂到他自己的出招表（hanshan.registerMove）上。
 * 他的寻常近战 AI（brawlfoe 的原型）不挑这些招（他的 kit 是空的）——轮到这一批由 hsBatch2Tick 按权重挑。
 */
export function registerHsBatch2(hs: Hanshan) {
  HS = hs;
  for (const m of ALL) registerMove(m);
  for (const m of ALL) hs.registerMove(m.id, (tg) => performHs2(hs, m.id, tg));
}
/** 让他出这一招（tg：对手，null = 你）。真人不在、平时（calm）不出；force：试玩入口（平时也出） */
export function performHs2(hs: Hanshan, id: string, tg: Enemy | null, force = false): boolean {
  const e = hs.ent, def = MOVES.get(id); if (!e || !def) return false;
  if (hs.mode === 'calm' && !force) return false;
  const B = hs.game.combat.brawl;
  const ok = B.startMove(def, e, tg ?? 'p');
  if (ok && force) { const r = B.peek(e)?.move; if (r) r.data.forced = true; }
  return ok;
}
/** 主角学会这一批的三招（燕回、十方弹、犁地） */
export function learnHsBatch2(h: Hero): string[] { const got: string[] = []; for (const id of HS2_LEARN) if (learnMove(h, id)) got.push(moveArtId(id)); return got; }

/**
 * （合并后游戏里已不调用：三批的招由 hanshan.pickCombo 统一编排，免得两个挑招器抢着出手；留着给 test-hsmoves2 第 7 段单独验这一批能被挑到）
 * 「按权重轮到这批招」的钩子：他在打（打妖兽、真怒、切磋还手之后）、手上空着时，
 * 每隔一会儿用近战自己的随机序列掷一次，按权重挑一招能出的。第一批的出招编排合并后可以把这里并进去。
 */
let aiT = 2.5;
export function hsBatch2Tick(hs: Hanshan, dt: number) {
  const e = hs.ent; if (!e) return;
  const live = hs.mode === 'brawl' || hs.mode === 'angry' || (hs.mode === 'spar' && !!hs.spar && hs.spar.counterAt > 0);
  if (!live) { aiT = Math.max(aiT, 2.5); return; }
  aiT -= dt; if (aiT > 0) return;
  aiT = 0.6;
  const B = hs.game.combat.brawl, b = B.peek(e);
  if (!b || b.move || b.air || b.staggerT > 0 || b.freezeT > 0 || b.subT > 0 || B.clash.st || (b.ai && b.ai.st !== 'idle')) return;
  // 对手：打妖兽时只打它（中立：不打你），真怒 / 切磋时是你
  let tg: W | null;
  if (hs.mode === 'brawl') { tg = b.ai?.tg ?? e.tgE ?? hs.beast ?? null; if (tg && (tg.dead || tg.gone)) tg = null; }
  else tg = 'p';
  if (!tg) return;
  if (tg === 'p' && (hs.game.hero.dead || B.pb.air || B.pSubT > 0 || (hs.mode === 'spar' && hs.game.hero.hp < 0.45))) return;   // 切磋里你快撑不住了：不再上花招（寻常拳脚收尾）；惹怒了照打
  const tp = tg === 'p' ? hs.game.player : tg, d = Math.hypot(tp.x - e.x, tp.y - e.y);
  if (brnd() > 0.55) return;
  const list: typeof HS2_MOVES = [];
  let sum = 0;
  for (const m of HS2_MOVES) {
    if ((e.skCd[m.id] ?? 0) > 0 || d < m.min || d > m.max) continue;
    if (m.grab && !grabbable(B, tg)) continue;
    if (m.id === 'lunren' && !rivalsNear(hs, e, tg)) continue;
    list.push(m); sum += m.w;
  }
  if (!list.length) return;
  let r = brnd() * sum, pick = list[list.length - 1];
  for (const m of list) { r -= m.w; if (r < 0) { pick = m; break; } }
  if (performHs2(hs, pick.id, tg === 'p' ? null : tg)) aiT = (hs.mode === 'spar' ? 5 : 3.2) + brnd() * 2.4;
}
/** 抡人为棍：身边还有别的冲他来的人才值得抡 */
function rivalsNear(hs: Hanshan, e: Enemy, tg: W): boolean {
  for (const o of hs.game.combat.enemies) if (o !== e && o !== tg && !o.dead && o.aggro && (o.tgE === e || o.grudge === e || o === hs.beast) && Math.hypot(o.x - e.x, o.y - e.y) < 700) return true;
  return false;
}
/** 测试用：挑招计时清零 */
export function hs2ResetAi(t = 0) { aiT = t; }
