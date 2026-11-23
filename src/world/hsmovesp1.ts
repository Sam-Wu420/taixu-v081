// 撼山客 · 岳千钧第一阶段照参考视频（DNF 男散打）还原的部分（r8-p1）。规格：docs/撼山客-参考视频动作分解.md 第二节。
//
// 一、四个新招（照视频逐帧摆：character.ts 末尾「关键帧动作」一段的 p1Duanmai / p1Kao / p1Knee / p1Crouch + p1FlyKick…）：
//   断脉腿 duanmai（碎骨）、撞山靠 zhuangshan（铁山靠，以后教给你）、顶心膝 dingxin（冲膝）、影踪连环踢 yingzong（瞬影连环踢）
// 二、给换成视频动作的七招（hsmoves.ts 的一寸崩、金刚不坏、后发先至、缩地成寸，hsmoves2.ts 的流星百裂、燕回、十方弹）共用的小工具：
//   侧面取景（sideCam：镜头推近、两人在画面上横着对打）、横着摆位（sideSpot）、挥击弧线（arcPts）、他打你时收着点（hitK）。
// 规矩同前两批：伤害一律走 MoveCtx.hit（hitEnemy / hitPlayer / npcHit），击飞走 MoveCtx.launch；招式路径上不碰 Math.random；
// 不带 ai 权重（寻常 NPC 不挑），出招由 hanshan.ts 的 pickCombo 编排。打击表现走 world/p1fx.ts（爆炸、冲击波、白闪、拖影是三维特效模块的立体版本）。
import type { Enemy } from './combat';
import type { BrawlSys } from './brawl';
import type { Hanshan } from './hanshan';
import type { Hero } from './cultivation';
import { registerMove, learnMove, moveArtId, MOVES, type MoveCtx, type SpecialMove } from './brawlmoves';
import { P1T, type Action } from '../gfx/character';
import { p1, type P3 } from './p1fx';

type W = Enemy | 'p';
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/** 数值（攻力倍数；p* 是你学会以后的那一份）。参照第二批同档的招：单下重击 1.4–1.6、连段每下 0.25–0.6、收尾 1.0 */
export const HSP1K = {
  duanmai: { k: 1.5, D: 1000, vz: 260, reach: 300 },
  zhuangshan: { k: 1.6, pK: 1.7, D: 2000, vz: 420, reach: 280, cone: { len: 560, half: 0.36, power: 2.4, k: 0.5, D: 900, vz: 380 } },
  dingxin: { knee: 0.6, fin: 1.0, D: 1500, vz: 620 },
  yingzong: { tick: 0.25, fin: 1.0, D: 1900, vz: 380 },
} as const;
/** 四个新招（试玩、测试、编排用） */
export const HSP1_IDS = ['duanmai', 'zhuangshan', 'dingxin', 'yingzong'] as const;
export const HSP1_NAMES: Record<string, string> = { duanmai: '断脉腿', zhuangshan: '撞山靠', dingxin: '顶心膝', yingzong: '影踪连环踢' };
/** 你学得会的（撞山靠：他撑到第二阶段再教；try=brawl&learn=p1 直接会） */
export const HSP1_LEARN = ['zhuangshan'] as const;

// ------------------------------------------------------------------ 小工具（七招换动作也用）
let HS: Hanshan | null = null;
/** 这一招是撼山客本人在放 */
export const byHs = (c: MoveCtx) => !!c.user && c.user === c.B.g.hanshan?.ent;
/** 某人此刻在哪（z：离地高度） */
export function kpos(c: MoveCtx, w: W): P3 { return p1(c.B).pos(w); }
/** 侧面取景：他放招时每帧调一次——镜头推近、焦点在两人中间、两人都框进画面（收招后 stageCam 接着缓回）。你放招时不接管镜头 */
export function sideCam(c: MoveCtx, dur = 0.4, push = 1.7, lead = 0) { if (byHs(c) && c.target) c.B.sideShot(c.user!, c.target, dur, push * 1.2, lead); }
/** 画面横向（地面上「屏幕右方」的方向） */
export function screenRight(B: BrawlSys): { x: number; y: number } { const hd = B.g.renderer?.hd; return hd ? hd.rightDir : { x: 1, y: 0 }; }
function standable(B: BrawlSys, x: number, y: number): boolean {
  const g = B.g;
  if (g.xukong?.fight?.on) return true;
  if (g.mijing?.active) return g.mijing.walk(x, y);
  try { return g.terrain.isLand(x, y) && g.terrain.walkFactor(x, y) > 0 && !g.space.blocked(x, y); } catch { return true; }
}
/**
 * 横着摆位：对手 t 的左边或右边（画面横向）dist 处——出招者在哪边就摆哪边（side 给了就按它：1 右、-1 左）。
 * 站不住就换另一边；两边都站不住就沿原来的方向。只有他本人放招时才横着摆（你放招时照你自己的方向）
 */
export function sideSpot(c: MoveCtx, tw: W, dist: number, side?: number): P3 {
  const u = kpos(c, c.user ?? 'p'), t = kpos(c, tw);
  const dx = u.x - t.x, dy = u.y - t.y, L = Math.hypot(dx, dy) || 1;
  const along = { x: t.x + dx / L * dist, y: t.y + dy / L * dist, z: 0 };
  if (!byHs(c)) return along;
  const r = screenRight(c.B), s = side ?? (dx * r.x + dy * r.y >= 0 ? 1 : -1);
  for (const sg of [s, -s]) { const x = t.x + r.x * sg * dist, y = t.y + r.y * sg * dist; if (standable(c.B, x, y)) return { x, y, z: 0 }; }
  return along;
}
/** r9：一下子挪出一大截（闪步、横着摆位）：衣带、发丝的弹簧直接贴到该在的位置（不然当成高速甩动，拉成一条条横着的长板） */
export function snapClothOf(st: { springs?: Map<string, { inited: boolean }>; strands?: Map<string, { inited: boolean }> } | undefined | null) {
  if (!st) return;
  if (st.springs) for (const s of st.springs.values()) s.inited = false;
  if (st.strands) for (const s of st.strands.values()) s.inited = false;
}
/** 摆位置（出招者或对手；你被摆时连画面一起） */
export function kput(c: MoveCtx, w: W, x: number, y: number) {
  if (w === 'p') { const p = c.B.g.player; if (Math.hypot(x - p.x, y - p.y) > 30) snapClothOf(p.st as never); p.x = x; p.y = y; p.st.x = x; p.st.y = y; }
  else { if (Math.hypot(x - w.x, y - w.y) > 30) snapClothOf(w.cs as never); w.x = x; w.y = y; w.kx = w.ky = 0; if (w.cs) { w.cs.x = x; w.cs.y = y; } }
}
/** 立刻转过去（不慢慢扭） */
export function kface(c: MoveCtx, w: W, dx: number, dy: number) {
  if (Math.abs(dx) + Math.abs(dy) < 1e-4) return;
  const st = w === 'p' ? c.B.g.player.st : w.cs; if (!st) return;
  st.faceToward(dx, dy, false); st.yaw = st.targetYaw;
  if (w !== 'p') w.facing = dx > 0 ? 1 : -1;
}
/** 播一个关键帧动作（从头来；你：近战的动作覆盖给够时长） */
export function kact(c: MoveCtx, w: W | null, a: Action, dur = 1.2) {
  const t = w ?? c.user ?? 'p';
  if (t === 'p') { c.B.playAct(a, dur); return; }
  t.cs?.restart(a);
}
/** 定住对手 t 息（连段中间不让他被打飞、自己走开） */
export function kpin(c: MoveCtx, w: W | null, t: number) {
  if (!w) return;
  if (w === 'p') { c.B.pb.freezeT = Math.max(c.B.pb.freezeT, t); c.B.holdPlayer(t, true); return; }
  const b = c.B.body(w); b.freezeT = Math.max(b.freezeT, t); c.B.track(w);
}
/** 打一下：他打你时收着点（切磋四成，真怒照打），打别人不收 */
export function hitK(c: MoveCtx, w: W, k: number, kind: string): boolean {
  const H = c.B.g.hanshan;
  const soft = w === 'p' && byHs(c) && H?.mode === 'spar' ? 0.4 : 1;
  return c.hit(w, k * soft, kind);
}
/**
 * 挥击弧线（三维点：x, y, 离地高度）：从出招者身侧沿弧线划到命中点。kind：拳（齐胸直出）、勾（由下往上）、踢（由低往高横扫）、扫（贴地）、膝（由下往前上）
 */
export function arcPts(c: MoveCtx, tw: W, kind: 'punch' | 'upper' | 'kick' | 'sweep' | 'knee' | 'elbow'): P3[] {
  const u = kpos(c, c.user ?? 'p'), t = kpos(c, tw), dx = t.x - u.x, dy = t.y - u.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
  const at = (f: number, side: number, z: number): P3 => ({ x: u.x + ux * L * f + nx * side, y: u.y + uy * L * f + ny * side, z: u.z + z });
  switch (kind) {
    case 'punch': return [at(0.15, 10, 100), at(0.55, 4, 110), at(0.95, 0, 112)];
    case 'elbow': return [at(0.05, 20, 110), at(0.45, 10, 116), at(0.8, 0, 115)];
    case 'upper': return [at(0.3, 0, 40), at(0.7, 0, 95), at(0.92, 0, 165)];
    case 'kick': return [at(-0.1, -20, 40), at(0.25, -30, 110), at(0.7, -10, 140), at(1.0, 0, 135)];
    case 'sweep': return [at(-0.3, -40, 18), at(0.2, -60, 14), at(0.7, -30, 16), at(1.05, 0, 20)];
    case 'knee': return [at(0.2, 0, 40), at(0.55, 0, 90), at(0.85, 0, 120)];
  }
}
/** 他起手报招名（和近战 AI 出特殊招式一样的小字）；你放的不报 */
function callName(c: MoveCtx, name: string) { if (c.user) c.B.combat.texts.push({ x: c.user.x, y: c.user.y - 150, s: name, color: '#ffb08a', t: 0, vy: -18 } as never); }
/** 收尾大字：你出招时挂在对手头上；他打你时屏幕上挂一行 */
function finisher(c: MoveCtx, name: string) {
  if (!c.user) { const t = c.target; if (t && t !== 'p') c.B.combo(t, name); return; }
  if (c.target === 'p') c.B.finisher = { s: `${name}！`, t: 0 };
}
function gone(c: MoveCtx, w: W | null): boolean {
  if (!w) return true;
  if (w === 'p') return c.B.g.hero.dead;
  return w.dead || w.gone || !(c.B.combat.enemies.includes(w) || c.B.combat.allies.includes(w));
}
/** 他本人收手了（切磋结束回到平时）：招式跟着停 */
const stood = (c: MoveCtx) => byHs(c) && HS?.mode === 'calm' && !c.data.forced;
const onlyHs = (B: BrawlSys, u: Enemy | null) => !!u && u === B.g.hanshan?.ent;
const hsOrYou = (B: BrawlSys, u: Enemy | null) => !u || u === B.g.hanshan?.ent;
/** 欺近：离对手远就一记闪步过去（青蓝速度带、残影、起步尘），近了就原地。返回落脚点 */
function closeIn(c: MoveCtx, tw: W, dist: number, far = 200): P3 {
  const u = kpos(c, c.user ?? 'p'), t = kpos(c, tw), d = Math.hypot(t.x - u.x, t.y - u.y);
  if (d <= far && !byHs(c)) return u;
  const q = sideSpot(c, tw, dist);
  if (Math.hypot(q.x - u.x, q.y - u.y) < 40) return u;
  kput(c, c.user ?? 'p', q.x, q.y);
  p1(c.B).dash(c.user ?? 'p', u, q, { n: d > far ? 3 : 2 });
  return q;
}

// ------------------------------------------------------------------ 1. 断脉腿（碎骨）
/** 伏身、后腿往后上提（脚跟蓄劲：脚下炸星 → 白光 → 一圈环），半息后一帧切出：身子后仰成一条线、后腿蹬直斜踹对手膝下——四层爆炸、把人踹得往后滑出去 */
const DUANMAI: SpecialMove = {
  id: 'duanmai', name: '断脉腿', glyph: '断', color: '255,190,120', cd: 8, range: 520, who: 'npc', can: onlyHs,
  desc: '伏身蓄劲，后脚跟往后一提，脚下炸开三下星光；半息后整个人后仰成一条线，一脚斜踹在对手膝下——炸开一团火，人被踹得往后滑出去。',
  begin(c) {
    if (!c.target || gone(c, c.target)) return false;
    callName(c, '断脉腿');
    const q = closeIn(c, c.target, 165, 230), t = kpos(c, c.target);
    c.data.dir = Math.atan2(t.y - q.y, t.x - q.x);
    kface(c, c.user ?? 'p', t.x - q.x, t.y - q.y);
    kact(c, null, 'p1Duanmai', 1.2);
  },
  tick(c) {
    const tw = c.target!, X = p1(c.B), uw = c.user ?? 'p';
    if (gone(c, tw) || stood(c)) return false;
    sideCam(c, 0.4, 1.75);
    const u = kpos(c, uw), dir = c.data.dir as number, ux = Math.cos(dir), uy = Math.sin(dir);
    const foot = (k: string) => X.fx({ k: 'p1charge', x: u.x - ux * 34, y: u.y - uy * 34, kind: k, anchor: { x: u.x - ux * 34, y: u.y - uy * 34, offsetY: -(u.z + 38) } });
    if (!c.data.c1 && c.t >= 0.07) { c.data.c1 = 1; foot('lines'); X.fx({ k: 'p1dust', x: u.x, y: u.y, dir: dir + Math.PI, power: 0.6 }); X.sfx('p1charge', u.x, u.y); }
    if (!c.data.c2 && c.t >= 0.2) { c.data.c2 = 1; foot('ball'); }
    if (!c.data.c3 && c.t >= 0.3) { c.data.c3 = 1; foot('ring'); }
    if (!c.data.hit && c.t >= P1T.duanmai.hit) {
      c.data.hit = 1;
      // 一帧切出：整个人往前一送（够不着就补上这一步）
      const t = kpos(c, tw), d = Math.hypot(t.x - u.x, t.y - u.y);
      if (d > 130 && d < HSP1K.duanmai.reach + 200) { const k = (d - 125) / d; kput(c, uw, u.x + (t.x - u.x) * k, u.y + (t.y - u.y) * k); }
      const u2 = kpos(c, uw), d2 = Math.hypot(t.x - u2.x, t.y - u2.y), hd = Math.atan2(t.y - u2.y, t.x - u2.x);
      X.fx({ k: 'p1dust', x: u2.x, y: u2.y, dir: hd + Math.PI, power: 1.4 });
      if (d2 <= HSP1K.duanmai.reach) {
        const landed = hitK(c, tw, HSP1K.duanmai.k, 'hsp1-duanmai');
        X.hit(c, tw, hd, 3, { arc: arcPts(c, tw, 'sweep'), col: '255,220,150', z: 40 });
        X.boom(t.x + Math.cos(hd) * 50, t.y + Math.sin(hd) * 50, t.z + 50, 0.85, hd);
        X.fx({ k: 'p1elec', x: t.x, y: t.y, r: 110, anchor: { x: t.x, y: t.y, offsetY: -(t.z + 60) } });
        if (landed) c.launch(tw, Math.cos(hd), Math.sin(hd), HSP1K.duanmai.D, HSP1K.duanmai.vz);
        try { c.B.combat.wreck?.cone(t.x, t.y, hd, 360, 0.4, 1.6, uw); } catch { /* 破坏系统出错不拖垮出招 */ }
        c.cam(1.1);
        finisher(c, '断脉腿');
      }
    }
    return c.t < P1T.duanmai.end;
  },
};

// ------------------------------------------------------------------ 2. 撞山靠（铁山靠）
/** 侧身沉成马步、左肩对着对手（身上一圈黄亮边、再一圈红），一帧切出：整个人往前一撞——撞点一大团蓝白冲击、一圈竖着的冲击环，对手被撞飞很远，身后一片也被掀开 */
const ZHUANGSHAN: SpecialMove = {
  id: 'zhuangshan', name: '撞山靠', glyph: '靠', color: '150,205,255', realm: 2, mp: 0.12, cd: 9, range: 520, who: 'both', can: hsOrYou,
  desc: '侧身沉马、肩背蓄满了劲，一步撞进对手怀里——撞点炸开一圈竖着的冲击环，人被撞飞出老远，身后一片也被掀翻。（撼山客亲传）',
  begin(c) {
    if (!c.target) { if (!c.user) c.B.g.toast('身前没有对手。', 'info'); return false; }
    callName(c, '撞山靠');
    const uw = c.user ?? 'p', q = closeIn(c, c.target, 150, 240), t = kpos(c, c.target);
    c.data.dir = Math.atan2(t.y - q.y, t.x - q.x);
    kface(c, uw, t.x - q.x, t.y - q.y);
    kact(c, null, 'p1Kao', 1.0);
  },
  tick(c) {
    const tw = c.target!, X = p1(c.B), uw = c.user ?? 'p', K = HSP1K.zhuangshan;
    if (gone(c, tw) || stood(c)) return false;
    sideCam(c, 0.45, 1.7, 0.4);
    if (!c.data.o1 && c.t >= 0.1) { c.data.o1 = 1; X.outline(uw, '255,214,70', 0.13, 7.5); const u0 = kpos(c, uw); X.sfx('p1charge', u0.x, u0.y); }
    if (!c.data.o2 && c.t >= 0.21) { c.data.o2 = 1; X.outline(uw, '255,90,30', 0.12, 6); }
    if (!c.data.hit && c.t >= P1T.kao.hit) {
      c.data.hit = 1;
      const u = kpos(c, uw), t = kpos(c, tw), d0 = Math.hypot(t.x - u.x, t.y - u.y), dir = d0 > 1 ? Math.atan2(t.y - u.y, t.x - u.x) : c.data.dir as number;
      // 一步撞进去：贴到对手跟前（最多 180）
      const go = clamp(d0 - 70, 0, 180), nx = u.x + Math.cos(dir) * go, ny = u.y + Math.sin(dir) * go;
      if (standable(c.B, nx, ny)) kput(c, uw, nx, ny);
      X.fx({ k: 'p1dust', x: u.x, y: u.y, dir: dir + Math.PI, power: 1.3 });
      const u2 = kpos(c, uw), d = Math.hypot(t.x - u2.x, t.y - u2.y);
      if (d <= K.reach) {
        const landed = hitK(c, tw, c.user ? K.k : K.pK, 'hsp1-zhuangshan');
        const hx = (u2.x + t.x) / 2, hy = (u2.y + t.y) / 2;
        X.hit(c, tw, dir, 3, { col: '160,210,255', z: 100, snd: 'p1bash' }); X.sfx('p1hitFin', t.x, t.y);
        X.fx({ k: 'p1sphere', x: hx, y: hy, r: 70, power: 1, color: '170,215,255', anchor: { x: hx, y: hy, offsetY: -(t.z + 100) } });
        X.shock(hx, hy, t.z + 100, dir, 1.2, '120,190,255');
        X.fx({ k: 'p1elec', x: hx, y: hy, r: 100, anchor: { x: hx, y: hy, offsetY: -(t.z + 100) } });
        if (landed) c.launch(tw, Math.cos(dir), Math.sin(dir), K.D, K.vz);
        const C0 = K.cone;
        c.B.impact.backBlast(c, t.x, t.y, dir, { len: C0.len, half: C0.half, power: C0.power, k: C0.k, D: C0.D, vz: C0.vz, skip: tw, z: t.z, kind: 'hsp1-zhuangshan-blast' });
        c.B.impact.inkFlash(); c.cam(1.2);
        finisher(c, '撞山靠');
      }
    }
    return c.t < P1T.kao.end;
  },
  end(c) { p1(c.B).clear(c.user ?? 'p', 'rim'); },
};

// ------------------------------------------------------------------ 3. 顶心膝（冲膝）
/** 两步冲上去、两手往前一揽，一帧切出：右膝顶到对手胸口（背后炸开一团紫白光），顶着不放，再一顶——红色 X 斩光一闪，前方一团橙黄的四层爆炸把人顶飞 */
const DINGXIN: SpecialMove = {
  id: 'dingxin', name: '顶心膝', glyph: '膝', color: '220,160,255', cd: 9, range: 560, who: 'npc', can: onlyHs,
  desc: '两步冲上去两手一揽，一膝顶在心口——背后炸开一团紫光；顶着不放再一顶，一团火光把人顶飞。',
  begin(c) {
    if (!c.target || gone(c, c.target)) return false;
    callName(c, '顶心膝');
    const uw = c.user ?? 'p', q = closeIn(c, c.target, 95, 150), t = kpos(c, c.target);
    c.data.dir = Math.atan2(t.y - q.y, t.x - q.x);
    kface(c, uw, t.x - q.x, t.y - q.y);
    kact(c, null, 'p1Knee', 1.0);
  },
  tick(c) {
    const tw = c.target!, X = p1(c.B), K = HSP1K.dingxin;
    if (gone(c, tw) || stood(c)) return false;
    sideCam(c, 0.4, 1.8);
    const dir = c.data.dir as number, t = kpos(c, tw);
    if (!c.data.h1 && c.t >= P1T.knee.hit) {
      c.data.h1 = 1;
      hitK(c, tw, K.knee, 'hsp1-dingxin');
      kpin(c, tw, P1T.knee.fin - P1T.knee.hit + 0.04);
      X.hit(c, tw, dir, 2, { arc: arcPts(c, tw, 'knee'), col: '220,170,255', z: 105, slide: false });
      // 背后炸开一团紫白光（冲击从身后透出去）
      const bx = t.x + Math.cos(dir) * 60, by = t.y + Math.sin(dir) * 60;
      X.fx({ k: 'p1sphere', x: bx, y: by, r: 70, power: 1, color: '200,150,255', anchor: { x: bx, y: by, offsetY: -(t.z + 110) } });
      X.fx({ k: 'p1star', x: t.x, y: t.y, dir, power: 2, color: '255,190,110', anchor: { x: t.x, y: t.y, offsetY: -(t.z + 105) } });
    }
    if (!c.data.xs && c.t >= P1T.knee.fin - 0.06) { c.data.xs = 1; X.fx({ k: 'p1xslash', x: t.x, y: t.y, r: t.z + 100, dir, color: '255,60,70' }); }
    if (!c.data.fin && c.t >= P1T.knee.fin) {
      c.data.fin = 1;
      const landed = hitK(c, tw, K.fin, 'hsp1-dingxin-fin');
      X.hit(c, tw, dir, 3, { arc: arcPts(c, tw, 'knee'), col: '255,200,120', z: 110 });
      X.boom(t.x + Math.cos(dir) * 60, t.y + Math.sin(dir) * 60, t.z + 100, 0.8, dir);
      if (landed) c.launch(tw, Math.cos(dir), Math.sin(dir), K.D, K.vz);
      c.cam(1.1);
      finisher(c, '顶心膝');
    }
    return c.t < P1T.knee.end;
  },
};

// ------------------------------------------------------------------ 4. 影踪连环踢（瞬影连环踢）
/** 伏身（一圈红亮边）→ 化成蓝色半透明的影子冲过去（整屏偏白一帧、竖着一道菱光）→ 蓝影贴身连踢 → 飞身侧踹 → 最后一脚是实体，把人踢飞 */
const YZ = { CROUCH: 0, GO: 0.13, H1: 0.2, CHAIN: [0.32, 0.4, 0.48], FLY: 0.62, SOLID: 0.86, FIN: 0.91, END: 1.3 };
const YINGZONG: SpecialMove = {
  id: 'yingzong', name: '影踪连环踢', glyph: '影', color: '110,180,255', cd: 11, range: 900, who: 'npc', can: onlyHs,
  desc: '伏身一沉，人化成一道蓝影冲过去，影子贴身连踢四脚，最后一脚是实打实的真身——把人踢飞出去。',
  begin(c) {
    if (!c.target || gone(c, c.target)) return false;
    callName(c, '影踪连环踢');
    const uw = c.user ?? 'p', u = kpos(c, uw), t = kpos(c, c.target);
    // 起手离对手远一点（三四个身位）：贴太近就往后滑开一步再起
    const d = Math.hypot(t.x - u.x, t.y - u.y);
    const q = d < 300 || d > 700 || byHs(c) ? sideSpot(c, c.target, 380) : u;
    c.data.sx = u.x; c.data.sy = u.y; c.data.qx = q.x; c.data.qy = q.y;
    c.data.dir = Math.atan2(t.y - q.y, t.x - q.x);
    kface(c, uw, t.x - q.x, t.y - q.y);
    kact(c, null, 'p1Crouch', 1.6);
    p1(c.B).outline(uw, '255,50,40', 0.16, 5);
  },
  tick(c) {
    const tw = c.target!, X = p1(c.B), uw = c.user ?? 'p', K = HSP1K.yingzong, T = c.t;
    if (gone(c, tw) || stood(c)) return false;
    sideCam(c, 0.45, 1.6, 0.3);
    if (T < YZ.GO) { const k = clamp(T / 0.07, 0, 1); kput(c, uw, (c.data.sx as number) + ((c.data.qx as number) - (c.data.sx as number)) * k, (c.data.sy as number) + ((c.data.qy as number) - (c.data.sy as number)) * k); return true; }
    const t = kpos(c, tw);
    if (!c.data.go) {
      c.data.go = 1;
      // 化成蓝影，一记闪步贴上去
      X.shadow(uw, '70,160,255', YZ.SOLID - YZ.GO, 0.84); X.sfx('p1charge', t.x, t.y);
      const a = kpos(c, uw), q = sideSpot(c, tw, 100, Math.sign(((a.x - t.x) * screenRight(c.B).x + (a.y - t.y) * screenRight(c.B).y) || -1));
      kput(c, uw, q.x, q.y); kface(c, uw, t.x - q.x, t.y - q.y);
      X.dash(uw, a, q, { n: 2, col: '70,170,255', ghost: '150,200,255' });
      kact(c, null, 'p1FlyKick', 1.4);
      kpin(c, tw, YZ.SOLID - YZ.GO + 0.05);
      c.data.dir = Math.atan2(t.y - q.y, t.x - q.x);
    }
    const dir = c.data.dir as number;
    const shadowHit = (n: number, tier: 1 | 2 | 3, act?: Action) => {
      if ((c.data.n as number | undefined ?? 0) >= n) return;
      c.data.n = n;
      if (act) kact(c, null, act, 1.2);
      hitK(c, tw, K.tick, 'hsp1-yingzong');
      X.hit(c, tw, dir, tier, { arc: arcPts(c, tw, 'kick'), col: tier === 1 ? '255,110,110' : '150,205,255', z: 110, slide: tier > 1 });
      X.fx({ k: 'p1diamond', x: t.x, y: t.y, r: t.z + 100, power: tier, color: '160,210,255' });
    };
    if (T >= YZ.H1 && !c.data.n) {
      shadowHit(1, 3);
      X.whiteout(0.42);   // 整屏白闪（瞬影冲到那一下，一帧）
      X.fx({ k: 'p1sphere', x: t.x, y: t.y, r: 110, power: 1.3, color: '235,245,255', anchor: { x: t.x, y: t.y, offsetY: -(t.z + 100) } });
      c.cam(0.9);
    }
    YZ.CHAIN.forEach((tc, i) => { if (T >= tc) shadowHit(2 + i, 1, i % 2 ? 'p1HighKick' : 'p1SideKick'); });
    if (T >= YZ.FLY - P1T.flyKick.hit && !c.data.flyA) { c.data.flyA = 1; kact(c, null, 'p1FlyKick', 1.0); }
    if (T >= YZ.FLY) { shadowHit(5, 2); }
    if (T >= YZ.SOLID && !c.data.solid) {
      c.data.solid = 1;
      X.clear(uw, 'over'); X.ghost(uw, '90,170,255', 0.25, 0.5);   // 蓝影褪下来，留一个影子在原处
      kact(c, null, 'p1HighKick', 1.0);
    }
    if (T >= YZ.FIN && !c.data.fin) {
      c.data.fin = 1;
      const landed = hitK(c, tw, K.fin, 'hsp1-yingzong-fin');
      X.hit(c, tw, dir, 3, { arc: arcPts(c, tw, 'kick'), col: '170,220,255', z: 120 });
      X.fx({ k: 'p1sphere', x: t.x, y: t.y, r: 90, power: 1.1, color: '150,205,255', anchor: { x: t.x, y: t.y, offsetY: -(t.z + 110) } });
      X.shock(t.x, t.y, t.z + 110, dir, 1, '140,200,255');
      if (landed) c.launch(tw, Math.cos(dir), Math.sin(dir), K.D, K.vz);
      c.B.impact.inkFlash(); c.cam(1.2);
      finisher(c, '影踪连环踢');
    }
    if (T >= YZ.FIN + P1T.highKick.end && !c.data.rec) { c.data.rec = 1; kact(c, null, 'p1Crouch', 0.6); }
    return T < YZ.END;
  },
  end(c) { const X = p1(c.B); X.clear(c.user ?? 'p'); },
};

const ALL = [DUANMAI, ZHUANGSHAN, DINGXIN, YINGZONG];
for (const m of ALL) registerMove(m);
/** 四招的定义（测试、试玩读） */
export const HSP1_DEFS: Record<string, SpecialMove> = Object.fromEntries(ALL.map((m) => [m.id, m]));

/** 撼山客构造时调一次：四招挂进他自己的出招表（hanshan.perform / pickCombo 从这里取） */
export function registerHsP1(hs: Hanshan) {
  HS = hs;
  for (const m of ALL) { registerMove(m); hs.registerMove(m.id, (tg) => performHsP1(hs, m.id, tg)); }
}
/** 让他出这一招（tg：对手，null = 你）。真人不在、平时（calm）不出；force：试玩入口（平时也出） */
export function performHsP1(hs: Hanshan, id: string, tg: Enemy | null, force = false): boolean {
  const e = hs.ent, def = MOVES.get(id); if (!e || !def) return false;
  if (hs.mode === 'calm' && !force) return false;
  const B = hs.game.combat.brawl;
  const ok = B.startMove(def, e, tg ?? 'p');
  if (ok && force) { const r = B.peek(e)?.move; if (r) r.data.forced = true; }
  return ok;
}
/** 你学会撞山靠（法术书里有、能拖进技能栏） */
export function learnHsP1(h: Hero): string[] { const got: string[] = []; for (const id of HSP1_LEARN) if (learnMove(h, id)) got.push(moveArtId(id)); return got; }
