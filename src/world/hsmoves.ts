// 撼山客 · 岳千钧的招式（设计定稿 docs/撼山客与破坏系统-设计.md 第四节）。第一批九招：
//   起手与位移：缩地成寸、踏空步、一寸崩、拳压·开山、震脚；
//   克制法修：气合、空手接宝、金刚不坏、后发先至。
// 每招都走近战的特殊招式挂载点（brawlmoves.registerMove：begin / tick / end 状态机，MoveCtx 上的伤害、击飞、上挑、接管位置、镜头），
// 打击表现走 world/impactfx.ts（黑白闪、背后炸开、拳压、超高速追击、定格特写、踏空气环），破坏走 world/wreck.ts。
// 规矩：
//   · 伤害一律走 MoveCtx.hit（hitEnemy / hitPlayer / npcHit），击飞走 MoveCtx.launch / up（近战的击飞物理，模组接管的 shell 单位自动跳过）；
//   · 谁能用：一寸崩、震脚是他答应传给你的（主角学会后在法术书里、能拖进技能栏，伤害按你的近战攻力）；其余七招只有他自己用（can 卡死，别的 NPC 不会挑）；
//   · 都不带 ai 权重：寻常会近战的 NPC 挑招时一个随机数都不多取，出招由 hanshan.ts 的编排决定；
//   · 这些招的路径上一个 Math.random 都不取（要抖动的用 brawlrng 的 hash32）。
import type { Enemy, Proj } from './combat';
import type { BrawlSys } from './brawl';
import { registerMove, type MoveCtx, type SpecialMove } from './brawlmoves';
import type { Action } from '../gfx/character';
import type { CutImg } from './impactfx';
import { ALT } from './alt';
import { P1T } from '../gfx/character';
import { p1 } from './p1fx';
import { sideCam, sideSpot, kface, kput, arcPts } from './hsmovesp1';   // r8-p1：一寸崩、金刚不坏、后发先至、缩地成寸换成参考视频的动作（侧面取景、横着摆位、挥击弧线）

const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/** 九招的 id（hanshan.ts 的编排、试玩入口、测试都用这一份） */
export const HS_BATCH1 = ['suodi', 'takong', 'yicunbeng', 'quanya', 'zhenjiao', 'qihe', 'kongshou', 'jingang', 'houfa'] as const;
export type HsMoveId = typeof HS_BATCH1[number];

/** 数值（伤害是出招者攻力的倍数：他打你时攻力已按「切磋压着打」调过，见 hanshan.pace；你学会的按你的近战攻力） */
export const HSM = {
  suodi: { k: 1.1, D: 1100, vz: 420, back: 115 },
  takong: { k: 1.6, kAoe: 0.45, R: 300, steps: 3, stepH: 95 },   // 每步升 95：三步到 285（再高默认镜头里人就出了画面）
  yicunbeng: { k: 2.6, kPlayer: 2.4, D: 1900, vz: 380, still: 0.3, cone: { len: 820, half: 0.4, power: 3.2, k: 0.7, D: 1100, vz: 600 } },
  quanya: { k: 0.9, kOthers: 0.25, len: 1150, w: 140, power: 2.4, D: 620, vz: 280 },
  zhenjiao: { k: 1.1, R: 440, rise: 0.75, power: 2.8 },
  qihe: { R: 620, push: 300, k: 0.3, D: 420, vz: 220 },
  kongshou: { catchR: 150, hold: 1.2, k: 1.3 },
  jingang: { win: 1.5, cut: 0.85, R: 420, k: 0.9, D: 760, vz: 380 },
  houfa: { k: 1.4, side: 95, D: 460, vz: 260 },
} as const;

// ------------------------------------------------------------ 小工具
type Who = Enemy | 'p';
const isHs = (B: BrawlSys, u: Enemy | null) => !!u && !!B.g.hanshan && u === B.g.hanshan.ent;
/** 只有撼山客用 */
const onlyHs = (B: BrawlSys, u: Enemy | null) => isHs(B, u);
/** 他用，或者学会了的你用 */
const hsOrPlayer = (B: BrawlSys, u: Enemy | null) => !u || isHs(B, u);
function upos(c: MoveCtx): { x: number; y: number; z: number } {
  const u = c.user; if (u) return { x: u.x, y: u.y, z: u.z };
  const p = c.B.g.player; return { x: p.x, y: p.y, z: p.z + c.B.playerLift };
}
function wpos(c: MoveCtx, w: Who | null): { x: number; y: number; z: number } | null {
  if (!w) return null;
  if (w === 'p') { const p = c.B.g.player; if (c.B.g.hero.dead) return null; return { x: p.x, y: p.y, z: p.z + c.B.playerLift }; }
  if (w.dead || w.gone || w.hideT > 0) return null;
  return { x: w.x, y: w.y, z: w.z };
}
function face(c: MoveCtx, dx: number, dy: number) { if (c.user) c.user.cs?.faceToward(dx, dy, false); else c.B.g.player.st.faceToward(dx, dy, false); }
/** 播动作（主角：近战的动作覆盖，给够时长；NPC：从头播） */
function act(c: MoveCtx, a: Action, dur = 0.7) { if (c.user) c.user.cs?.restart(a); else c.B.playAct(a, dur); }
/** 把出招者这一招的动作停在 t（蓄着不放：一寸崩停半拍、金刚不坏站定） */
function holdAt(c: MoveCtx, t: number) { const st = c.user ? c.user.cs : c.B.g.player.st; if (st && st.actionT > t) st.actionT = t; }
/** 头顶飘一行字 */
function say(c: MoveCtx, s: string, color = '#ffe0a0', big = true, who: Who | null = null, dy = 0) {
  const q = who ? wpos(c, who) : upos(c); if (!q) return;
  c.B.combat.texts.push({ anchor: { x: q.x, y: q.y, offsetY: -q.z }, x: q.x, y: q.y - 210 + dy, s, color, t: 0, vy: -16, big } as never);
}
/** 招名：他放招时头顶一行；你放时界面那一行收尾大字 */
function named(c: MoveCtx, name: string, tg: Who | null) {
  if (c.user) say(c, name, '#ffcf8a', true);
  else if (tg && tg !== 'p') c.B.combo(tg, name);
}
/** 停住对手（零距离停半拍时对手也动不了；你被停住时也走不了） */
function pin(c: MoveCtx, w: Who | null, t: number) {
  if (!w) return;
  if (w === 'p') { c.B.pb.freezeT = Math.max(c.B.pb.freezeT, t); return; }
  const b = c.B.body(w); b.freezeT = Math.max(b.freezeT, t); c.B.track(w);
}
/** 打断对手正在蓄的那一下（你的重击前摇、NPC 的重击 / 施法） */
function interrupt(c: MoveCtx, w: Who | null, t = 0.45) {
  if (!w) return;
  if (w === 'p') { c.B.holdPlayer(t, true); return; }
  const b = c.B.peek(w);
  if (b?.ai) { b.ai.st = 'idle'; b.ai.wind = 0; b.ai.hold = 0; b.ai.cd = Math.max(b.ai.cd, 0.8); }
  if (w.cast) c.B.combat.foe.interrupt(w);
  w.windup = 0;
  if (b) b.staggerT = Math.max(b.staggerT, t);
}
/** 他的定格特写：编排要求（c.data.cut）才切，频率上限在 impactfx 里 */
function cut(c: MoveCtx, img: CutImg, line: string) { if (c.data.cut && isHs(c.B, c.user)) c.B.impact.cutIn(img, line); }
const ink = (c: MoveCtx) => c.B.impact.inkFlash();

/** 一个法术 / 飞剑是不是冲着出招者来的（对他有敌意、在 R 以内、正朝他飞） */
function incoming(c: MoveCtx, pr: Proj, R: number): boolean {
  const u = upos(c), py = pr.y + (pr.visual?.groundOffsetY ?? 40);
  const dx = u.x - pr.x, dy = u.y - py, d = Math.hypot(dx, dy);
  if (d > R) return false;
  if (c.user) {
    const hostile = pr.fac === 'p' ? !pr.ally : pr.src !== c.user && (pr.tk === c.user || (pr.src && (pr.src.tgE === c.user || pr.src === c.B.g.hanshan?.beast)));
    if (!hostile) return false;
  } else if (pr.fac !== 'e' || pr.ally) return false;
  return d < 120 || pr.vx * dx + pr.vy * dy > 0;
}
const isBlade = (pr: Proj) => pr.fx === 'sword' || pr.fx === 'needle';
/** 把一个法术 / 飞剑反打回去：朝它的来处（你的、或者放它的那个 NPC） */
function sendBack(c: MoveCtx, pr: Proj, k: number, sx: number, sy: number) {
  const u = c.user, g = c.B.g, back: Enemy | 'p' | null = pr.fac === 'p' ? 'p' : pr.src ?? null;
  const T = wpos(c, back); if (!T || !u) return false;
  const sp = Math.max(900, Math.hypot(pr.vx, pr.vy) * 1.25), ty = T.y - 46, d = Math.hypot(T.x - sx, ty - sy) || 1;
  pr.x = sx; pr.y = sy; pr.vx = (T.x - sx) / d * sp; pr.vy = (ty - sy) / d * sp;
  pr.fac = 'e'; pr.src = u; pr.tk = back === 'p' ? undefined : back as Enemy; pr.ally = false; pr.homing = false; pr.target = null;
  pr.hit = new Set(); pr.life = 0; pr.max = d / sp + 0.5; pr.zAim = undefined; pr.vz = 0; pr.trail = [];
  pr.dmg = Math.max(pr.dmg * 0.6, u.atk * k); pr.realm = u.realm; pr.aoe = 0;
  if (!g.combat.projs.includes(pr)) g.combat.projs.push(pr);
  return true;
}

// ------------------------------------------------------------ 起手与位移
/** 缩地成寸：人消失，只剩一道线和落点的气爆，出现在对手背后——转身一拳把人往回打 */
const suodi: SpecialMove = {
  id: 'suodi', name: '缩地成寸', glyph: '缩', color: '255,226,170', cd: 5, range: 1500, who: 'npc', can: onlyHs,
  desc: '一步缩地：人凭空没了，只剩一道线，下一瞬已在对手背后，回身一拳把人打回去。',
  // r8-p1 换成参考视频「闪步」（21.5–22.3）的动作：伏身蹬地、脚下一团暗星 → 一帧之后人已在对手身后（提膝独立），身后一串同一姿势的白色残影、
  // 一条青蓝速度带、地上一道往后的黄色冲击刺、起点一团土 → 回身一记直拳（0.24 命中，和原来同一刻）。落点横着摆在对手另一侧（画面上左右对打）
  begin(c) {
    if (!wpos(c, c.target)) return false; act(c, 'p1Dash', 0.9); c.data.ph = 0;
    const u = upos(c); p1(c.B).fx({ k: 'p1charge', x: u.x, y: u.y, kind: 'lines', anchor: { x: u.x, y: u.y, offsetY: -(u.z + 20) } });
  },
  tick(c) {
    const T = wpos(c, c.target), u = upos(c);
    sideCam(c, 0.35, 1.55, 0.3);
    if (c.data.ph === 0 && c.t >= 0.04 && !c.data.star) { c.data.star = 1; p1(c.B).fx({ k: 'p1charge', x: u.x, y: u.y, kind: 'ball', anchor: { x: u.x, y: u.y, offsetY: -(u.z + 22) } }); }
    if (c.data.ph === 0 && c.t >= 0.08) {
      if (!T) return false;
      c.data.ph = 1;
      // 落点：他放招时横着摆到对手的另一侧（画面上左右穿过去）；你放时照原来（顺着冲的方向到背后）
      let bx: number, by: number;
      const dx0 = T.x - u.x, dy0 = T.y - u.y, d0 = Math.hypot(dx0, dy0) || 1;
      if (c.user) { const r0 = c.B.g.renderer?.hd?.rightDir ?? { x: 1, y: 0 }, side = (u.x - T.x) * r0.x + (u.y - T.y) * r0.y >= 0 ? -1 : 1; bx = T.x + r0.x * side * HSM.suodi.back; by = T.y + r0.y * side * HSM.suodi.back; }
      else { bx = T.x + dx0 / d0 * HSM.suodi.back; by = T.y + dy0 / d0 * HSM.suodi.back; }
      const dx = bx - u.x, dy = by - u.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
      c.B.impact.blink(u.x, u.y, bx, by, u.z, T.z);
      c.place(null, bx, by, c.user ? T.z : undefined);
      face(c, ux, uy); act(c, 'p1Dash', 0.9);   // 落地那一下是闪步的落定姿势（提膝独立、朝着冲的方向）
      if (c.user?.cs) c.user.cs.actionT = P1T.dash.arrive;
      p1(c.B).dash(c.user ?? 'p', u, { x: bx, y: by, z: c.user ? T.z : u.z }, { n: 3 });
      // 回身那一拳朝对手（不是朝冲来的方向）
      const bdx = T.x - bx, bdy = T.y - by, bl = Math.hypot(bdx, bdy) || 1;
      c.data.ux = -bdx / bl; c.data.uy = -bdy / bl;
    }
    if (c.data.ph === 1 && c.t >= 0.24 - P1T.jab.hit && !c.data.turn) { c.data.turn = 1; face(c, -(c.data.ux as number), -(c.data.uy as number)); act(c, 'p1Jab', 0.5); }
    if (c.data.ph === 1 && c.t >= 0.24) {
      c.data.ph = 2;
      if (T) {
        const ux = -(c.data.ux as number), uy = -(c.data.uy as number);
        if (c.hit(c.target, HSM.suodi.k, 'hs-suodi')) {
          c.launch(c.target, ux, uy, HSM.suodi.D, HSM.suodi.vz);
          p1(c.B).hit(c, c.target!, Math.atan2(uy, ux), 2, { arc: arcPts(c, c.target!, 'punch'), z: 110 });
          c.cam(0.6); c.B.g.juice(0.04, 0.3);
          named(c, '缩地成寸', c.target);
        }
      }
    }
    return c.t < 0.62;
  },
};

/** 踏空步：腾空而起，每踩一步脚下炸一圈气环，三步踩到对手头顶，一脚连人带地踩下去 */
const takong: SpecialMove = {
  id: 'takong', name: '踏空步', glyph: '踏', color: '240,240,230', cd: 8, range: 1000, who: 'npc', can: onlyHs,
  desc: '一步一步踩着空气往上走，每一步脚下炸开一圈气环；三步踩到对手头顶，一脚连人带地踩下去。',
  begin(c) {
    const T = wpos(c, c.target); if (!T) return false;
    const u = upos(c); c.data.sx = u.x; c.data.sy = u.y; c.data.sz = u.z; c.data.step = 0; c.data.dive = 0;
    act(c, 'stomp');
  },
  tick(c) {
    const T = wpos(c, c.target), sx = c.data.sx as number, sy = c.data.sy as number;
    const tx = T ? T.x : sx + c.dirX * 400, ty = T ? T.y : sy + c.dirY * 400;
    const stepAt = [0.12, 0.34, 0.56], frac = [0.28, 0.56, 0.86], top = Math.min(ALT.max - 40, HSM.takong.stepH * HSM.takong.steps);
    const step = c.data.step as number;
    if (step < 3) {
      // 两步之间顺着弧线滑上去（每一步都是一次蹬地起跳）
      const t0 = step === 0 ? 0 : stepAt[step - 1], f0 = step === 0 ? 0 : frac[step - 1], z0 = step === 0 ? (c.data.sz as number) : HSM.takong.stepH * step;
      const k = clamp((c.t - t0) / (stepAt[step] - t0), 0, 1), e = 1 - (1 - k) * (1 - k);
      const f = f0 + (frac[step] - f0) * e, z = z0 + (Math.min(top, HSM.takong.stepH * (step + 1)) - z0) * e;
      c.place(null, sx + (tx - sx) * f, sy + (ty - sy) * f, z);
      face(c, tx - sx, ty - sy);
      if (c.t >= stepAt[step]) {
        const q = upos(c);
        c.B.impact.airRing(q.x, q.y, q.z, 1 + step * 0.3);
        c.data.step = step + 1; act(c, 'stomp'); c.B.g.juice(0, 0.08);
      }
      return true;
    }
    // 俯冲踩下
    const t1 = 0.74, t2 = 0.88;
    if (c.t < t1) return true;
    if (!c.data.dive) { c.data.dive = 1; act(c, 'stomp'); c.data.dx0 = upos(c).x; c.data.dy0 = upos(c).y; c.data.dz0 = upos(c).z; }
    if (c.t < t2) {
      const k = (c.t - t1) / (t2 - t1), e = k * k;
      c.place(null, (c.data.dx0 as number) + (tx - (c.data.dx0 as number)) * e, (c.data.dy0 as number) + (ty - (c.data.dy0 as number)) * e, (c.data.dz0 as number) * (1 - e));
      holdAt(c, 0.24);
      return true;
    }
    if (c.data.dive === 1) {
      c.data.dive = 2;
      c.place(null, tx - c.dirX * 95, ty - c.dirY * 95, 0);   // 落在对手跟前一步（贴太近，被踩飞的人起飞时会撞上他自己）
      const W = c.B.combat.wreck;
      let units: import('./wreck').WreckHit[] = [];
      try { units = W?.radial(tx, ty, HSM.takong.R, 2.6, c.user ?? 'p', { mark: 'pit' }).units ?? []; } catch { units = []; }
      c.fx({ k: 'hsstomp', x: tx, y: ty, r: HSM.takong.R } as never);
      if (T && c.hit(c.target, HSM.takong.k, 'hs-takong')) { c.launch(c.target, c.dirX, c.dirY, 700, 520); named(c, '踏空步', c.target); }
      c.B.impact.affect(c, units, { k: HSM.takong.kAoe, kind: 'hs-takong', D: 520, vz: 480, skip: c.target });
      ink(c); c.B.g.juice(0.07, 0.6); c.cam(1);
    }
    return c.t < 1.2;
  },
  end(c) { const u = upos(c); if (c.user && u.z > 0) c.place(null, u.x, u.y, 0); },
};

/** 一寸崩：贴身零距离停半拍，一拳——力道从对手背后呈锥形炸出去，掀翻后面一片 */
const yicunbeng: SpecialMove = {
  id: 'yicunbeng', name: '一寸崩', glyph: '崩', color: '255,190,110', realm: 1, mp: 0.1, cd: 7, range: 520, who: 'both', can: hsOrPlayer,
  desc: '贴身零距离停半拍，一拳——力道穿过对手的身子，从他背后呈锥形炸出去，后面一片全被掀翻。（撼山客亲传）',
  // r8-p1 换成参考视频「强拳」（4.27 架势 → 4.34 一帧切到直拳伸满 → 4.47 收）：贴身后先停半拍（关键帧 p1Cross 的 0.06–0.42：拳收到腰、身子拧回去、发着抖），
  // 一帧切出直拳——拳臂拉长、拳头放大、身后多画几条半透明的拳、一条拖影带；命中白星闪 → 蓝白电光 → 橙色小爆（视频里的三下），背后照旧锥形炸开
  begin(c) {
    const T = wpos(c, c.target); if (!T) return false;
    const u = upos(c), d = Math.hypot(T.x - u.x, T.y - u.y) || 1;
    const g = c.target ? sideSpot(c, c.target, 75) : { x: T.x - (T.x - u.x) / d * 75, y: T.y - (T.y - u.y) / d * 75 };
    const gap = Math.hypot(g.x - u.x, g.y - u.y);
    c.data.sx = u.x; c.data.sy = u.y; c.data.gx = g.x; c.data.gy = g.y; c.data.tIn = gap > 45 ? Math.min(0.16, Math.max(0.07, gap / 3200)) : 0; c.data.ph = 0;
    act(c, gap > 45 ? 'p1Dash' : 'p1Cross', 1.0);
    if (gap > 220) { p1(c.B).dash(c.user ?? 'p', u, { x: g.x, y: g.y, z: u.z }, { n: 2 }); kput(c, c.user ?? 'p', g.x, g.y); c.data.sx = g.x; c.data.sy = g.y; }
  },
  tick(c) {
    const T = wpos(c, c.target); if (!T && (c.data.ph as number) < 2) return false;
    const tIn = c.data.tIn as number, still = HSM.yicunbeng.still;
    sideCam(c, 0.45, 1.85, 0.35);
    if (c.data.ph === 0) {
      // 一步欺到对手跟前（贴身：七十五；他放招时横着摆在对手左边或右边）
      const k = tIn > 0 ? clamp(c.t / tIn, 0, 1) : 1, sx = c.data.sx as number, sy = c.data.sy as number, gx = c.data.gx as number, gy = c.data.gy as number;
      c.place(null, sx + (gx - sx) * k, sy + (gy - sy) * k);
      const dx = T!.x - gx, dy = T!.y - gy;
      face(c, dx, dy);
      if (k >= 1) {
        c.data.ph = 1; c.data.t1 = c.t; c.data.dir = Math.atan2(dy, dx);
        act(c, 'p1Cross', 1.0);
        pin(c, c.target, still + 0.16);
        const u = upos(c);
        c.fx({ k: 'bxcharge', anchor: { x: u.x, y: u.y, offsetY: -u.z }, x: u.x, y: u.y - 60, color: '255,200,120', power: 2, r: still });
        p1(c.B).sfx('p1charge', u.x, u.y);
      }
      return true;
    }
    if (c.data.ph === 1) {
      // 停半拍：拳收在腰间不放（对手也被这股势压着动不了）——姿势由关键帧 p1Cross 定着，到 0.42 那一帧切出直拳
      if (c.t - (c.data.t1 as number) < P1T.cross.hit - 0.1) return true;
      c.data.ph = 2; c.data.t2 = c.t;
      return true;
    }
    if (c.data.ph === 2 && c.t - (c.data.t2 as number) >= 0.1) {
      c.data.ph = 3;
      kface(c, c.user ?? 'p', Math.cos(c.data.dir as number), Math.sin(c.data.dir as number));
      const dir = c.data.dir as number, ux = Math.cos(dir), uy = Math.sin(dir);
      const k = c.user ? HSM.yicunbeng.k : HSM.yicunbeng.kPlayer;
      cut(c, 'fist', '一寸崩');
      const landed = c.hit(c.target, k, 'hs-yicun');
      if (T) {
        if (landed) c.launch(c.target, ux, uy, HSM.yicunbeng.D, HSM.yicunbeng.vz);
        p1(c.B).hit(c, c.target!, dir, 3, { arc: arcPts(c, c.target!, 'punch'), col: '255,236,190', z: 112 });
        c.data.hx = T.x; c.data.hy = T.y; c.data.hz = T.z;
        const C = HSM.yicunbeng.cone;
        c.B.impact.backBlast(c, T.x, T.y, dir, { len: C.len, half: C.half, power: C.power, k: C.k, D: C.D, vz: C.vz, skip: c.target, z: T.z, kind: 'hs-yicun-blast' });
      }
      ink(c); c.B.g.juice(0.09, 0.62); c.B.g.aberrKick = Math.max(c.B.g.aberrKick, 0.6); c.cam(1.3);
      named(c, '一寸崩', c.target);
    }
    // 视频里白星闪之后跟着一团蓝白电光（+0.13）、一团橙色小爆（+0.2）
    if (c.data.ph === 3 && c.data.hx !== undefined) {
      const x = c.data.hx as number, y = c.data.hy as number, z = c.data.hz as number, dt3 = c.t - (c.data.t2 as number) - 0.1;
      if (!c.data.e1 && dt3 >= 0.13) { c.data.e1 = 1; p1(c.B).fx({ k: 'p1elec', x, y, r: 95, anchor: { x, y, offsetY: -(z + 110) } }); }
      if (!c.data.e2 && dt3 >= 0.2) { c.data.e2 = 1; p1(c.B).boom(x, y, z + 105, 0.55); }   // 四层爆炸（小，三维模块）
    }
    return (c.data.ph as number) < 3 || c.t - (c.data.t2 as number) < 0.55;
  },
};

/** 拳压·开山：隔空一拳，拳没到风先到——直线上草伏、石裂、地面犁出一道沟，远处的人被推开 */
const quanya: SpecialMove = {
  id: 'quanya', name: '拳压·开山', glyph: '压', color: '235,235,225', cd: 6, range: 1300, who: 'npc', can: onlyHs,
  desc: '隔空一拳：拳没到风先到，一道压缩的气浪沿直线推出去——草伏、石裂、地上犁出一道沟，线上的人被推开。',
  begin(c) { act(c, 'smash', 0.8); c.data.done = 0; const T = wpos(c, c.target); if (T) { const u = upos(c); c.data.dir = Math.atan2(T.y - u.y, T.x - u.x); face(c, T.x - u.x, T.y - u.y); } else c.data.dir = Math.atan2(c.dirY, c.dirX); },
  tick(c) {
    if (!c.data.done && c.t >= 0.2) {
      c.data.done = 1;
      const u = upos(c), dir = c.data.dir as number, Q = HSM.quanya;
      c.B.impact.fistWind(c, u.x + Math.cos(dir) * 50, u.y + Math.sin(dir) * 50, dir, { len: Q.len, w: Q.w, power: Q.power, k: Q.k, kOthers: Q.kOthers, D: Q.D, vz: Q.vz, kind: 'hs-quanya' });
      c.B.g.juice(0.03, 0.35); c.cam(0.5);
      named(c, '拳压·开山', c.target);
    }
    return c.t < 0.62;
  },
};

/** 震脚：一脚踏地，地面成圈龟裂，周围的人全被震到半空 */
const zhenjiao: SpecialMove = {
  id: 'zhenjiao', name: '震脚', glyph: '震', color: '230,200,150', realm: 1, mp: 0.12, cd: 9, range: 440, who: 'both', can: hsOrPlayer,
  desc: '提膝，一脚踏地：脚下成圈龟裂，周围的人全被震到半空。（撼山客亲传）',
  begin(c) { act(c, 'stomp', 1.1); c.data.done = 0; },
  tick(c) {
    if (!c.data.done && c.t >= 0.27) {
      c.data.done = 1;
      const u = upos(c), Z = HSM.zhenjiao;
      if (c.data.cut) cut(c, 'stomp', '震脚');
      let units: import('./wreck').WreckHit[] = [];
      try { units = c.B.combat.wreck?.radial(u.x, u.y, Z.R, Z.power, c.user ?? 'p', { mark: 'crack' }).units ?? []; } catch { units = []; }
      c.fx({ k: 'hsstomp', x: u.x, y: u.y, r: Z.R } as never);
      let n = 0;
      for (const h of units) {
        if (!c.B.impact.hostile(c, h)) continue;
        const who: Who = h.player ? 'p' : h.e!;
        c.hit(who, Z.k * (0.55 + 0.45 * h.k), 'hs-zhenjiao');
        if (who === 'p' || h.launchable) c.up(who, Z.rise * (0.6 + 0.4 * h.k));
        n++;
      }
      if (n >= 2 || c.data.cut) ink(c);
      c.B.g.juice(0.06, 0.55); c.cam(0.8);
      named(c, '震脚', c.target);
    }
    return c.t < 0.95;
  },
};

// ------------------------------------------------------------ 克制法修
/** 气合：一声大喝，飞来的法术和飞剑被震碎（飞剑弹回去），身边的人被声浪推开 */
const qihe: SpecialMove = {
  id: 'qihe', name: '气合', glyph: '喝', color: '240,236,220', cd: 7, range: 900, who: 'npc', can: onlyHs,
  desc: '一声大喝：周身六丈之内，飞来的法术被震碎、飞剑被震回去，身边的人被声浪推开。',
  begin(c) { act(c, 'shout', 1.0); c.data.done = 0; },
  tick(c) {
    if (!c.data.done && c.t >= 0.17) {
      c.data.done = 1;
      const u = upos(c), Q = HSM.qihe, I = c.B.impact, C = c.B.combat;
      let shattered = 0, reflected = 0;
      const keep: Proj[] = [];
      for (const pr of C.projs) {
        if (!incoming(c, pr, Q.R)) { keep.push(pr); continue; }
        const py = pr.y;
        if (isBlade(pr) && (reflected < 3) && sendBack(c, pr, 0.9, pr.x, py)) { reflected++; keep.push(pr); c.fx({ k: 'hsclamp', x: pr.x, y: py, color: pr.color } as never); continue; }
        shattered++;
        c.fx({ k: 'hsshatter', x: pr.x, y: py, color: pr.color } as never);
      }
      C.projs = keep;
      (I.stats as Record<string, number>).shatter = ((I.stats as Record<string, number>).shatter ?? 0) + shattered;
      (I.stats as Record<string, number>).reflect = ((I.stats as Record<string, number>).reflect ?? 0) + reflected;
      c.data.shattered = shattered; c.data.reflected = reflected;
      // 身边的人被声浪推开
      for (const o of [...C.enemies, 'p' as const]) {
        const q = wpos(c, o); if (!q || o === c.user) continue;
        const d = Math.hypot(q.x - u.x, q.y - u.y); if (d > Q.push) continue;
        const h = { e: o === 'p' ? null : o, player: o === 'p', ally: false, x: q.x, y: q.y, ux: (q.x - u.x) / (d || 1), uy: (q.y - u.y) / (d || 1), d, k: 1 - d / Q.push, power: 1, launchable: o === 'p' || c.B.launchable(o) };
        if (!I.hostile(c, h)) continue;
        c.hit(o, Q.k, 'hs-qihe'); if (h.launchable) c.launch(o, h.ux || 1, h.uy, Q.D, Q.vz);
      }
      c.fx({ k: 'hsqihe', x: u.x, y: u.y, r: Q.R } as never);
      say(c, '喝——！', '#fff2d0', true);
      c.B.g.juice(0.05, 0.5); c.B.g.aberrKick = Math.max(c.B.g.aberrKick, 0.45); c.cam(0.6);
    }
    return c.t < 0.85;
  },
};

/** 空手接宝：两指夹住飞来的飞剑（夹几息再丢回去），火球一把捏灭 */
const kongshou: SpecialMove = {
  id: 'kongshou', name: '空手接宝', glyph: '接', color: '230,240,255', cd: 6, range: 900, who: 'npc',
  can: (B, u) => onlyHs(B, u),
  desc: '对着他飞来的飞剑，两指一夹——夹在指间几息，再原样丢回去；火球之类的法术，一把捏灭。',
  begin(c) {
    // 挑最近的一件冲他来的（没有就作罢）
    let best: Proj | null = null, bd = 1e9; const u = upos(c);
    for (const pr of c.B.combat.projs) { if (!incoming(c, pr, 820)) continue; const d = Math.hypot(pr.x - u.x, pr.y + (pr.visual?.groundOffsetY ?? 40) - u.y); if (d < bd) { bd = d; best = pr; } }
    if (!best) return false;
    c.data.pr = best; c.data.ph = 0; c.data.blade = isBlade(best) ? 1 : 0;
    face(c, best.x - u.x, best.y - u.y);
    act(c, 'grab', 1.6);
  },
  tick(c) {
    const pr = c.data.pr as Proj, u = upos(c), C = c.B.combat, I = c.B.impact;
    const fx = u.x + Math.sign((pr.x - u.x) || 1) * 34, fz = u.z + 98;
    if (c.data.ph === 0) {
      holdAt(c, 0.12);
      if (!C.projs.includes(pr)) return false;   // 已经打中了别的东西
      const py = pr.y + (pr.visual?.groundOffsetY ?? 40), d = Math.hypot(pr.x - u.x, py - u.y);
      if (d > HSM.kongshou.catchR && c.t < 0.9) {
        // 往他手上引：飞来的那一下正好落到指间
        const sp = Math.hypot(pr.vx, pr.vy) || 600, hx = fx - pr.x, hy = u.y - (pr.visual?.groundOffsetY ?? 40) - pr.y, hl = Math.hypot(hx, hy) || 1;
        pr.vx = hx / hl * sp; pr.vy = hy / hl * sp; pr.homing = false;
        return true;
      }
      // 夹住 / 捏灭
      C.projs = C.projs.filter((q) => q !== pr);
      const st = I.stats as Record<string, number>;
      if (c.data.blade) {
        c.data.ph = 1; c.data.t1 = c.t; st.caught = (st.caught ?? 0) + 1;
        I.held.push({ x: fx, y: u.y, z: fz, ang: Math.atan2(pr.vy, pr.vx), color: pr.color, fx: pr.fx, t: 0 });
        c.data.held = I.held[I.held.length - 1];
        c.fx({ k: 'hsclamp', anchor: { x: fx, y: u.y, offsetY: -fz }, x: fx, y: u.y, color: pr.color } as never);
        say(c, '两指夹剑', '#e8f0ff', false);
        c.B.g.juice(0.05, 0.2);
      } else {
        c.data.ph = 3; c.data.t1 = c.t; st.pinch = (st.pinch ?? 0) + 1;
        c.fx({ k: 'hspinch', anchor: { x: fx, y: u.y, offsetY: -fz }, x: fx, y: u.y, color: pr.color } as never);
        say(c, '一把捏灭', '#ffd0a0', false);
        c.B.g.juice(0.04, 0.15);
      }
      return true;
    }
    if (c.data.ph === 1) {
      // 夹在指间：剑身发颤（GL 画 impact.held），转身朝来处
      holdAt(c, 0.12);
      const h = c.data.held as { x: number; y: number; z: number; ang: number; t: number } | undefined;
      if (h) { h.x = fx; h.y = u.y; h.z = fz; h.t += 1 / 60; }
      if (c.t - (c.data.t1 as number) < HSM.kongshou.hold) return true;
      c.data.ph = 2; act(c, 'grab', 0.6);
      const back = pr.fac === 'p' ? 'p' : pr.src ?? null, T = wpos(c, back);
      if (T) face(c, T.x - u.x, T.y - u.y);
      return true;
    }
    if (c.data.ph === 2) {
      if (c.t - (c.data.t1 as number) < HSM.kongshou.hold + 0.16) return true;
      c.data.ph = 4;
      I.held = I.held.filter((h) => h !== c.data.held);
      if (sendBack(c, pr, HSM.kongshou.k, fx, u.y - 70)) { (I.stats as Record<string, number>).thrown = ((I.stats as Record<string, number>).thrown ?? 0) + 1; say(c, '还你！', '#ffe0a0', true); }
      c.fx({ k: 'bxhit', x: fx, y: u.y - 70, color: '230,240,255', power: 1.5, dir: Math.atan2(pr.vy, pr.vx) });
      c.data.t4 = c.t;
      return true;
    }
    if (c.data.ph === 3) return c.t - (c.data.t1 as number) < 0.45;
    return c.t - (c.data.t4 as number) < 0.3;
  },
  end(c) { const I = c.B.impact; if (c.data.held) I.held = I.held.filter((h) => h !== c.data.held); },
};

/** 金刚不坏：站着硬吃一招（那一下伤害大减、打不飞），一圈金色罡气反震回去 */
const jingang: SpecialMove = {
  id: 'jingang', name: '金刚不坏', glyph: '刚', color: '255,210,110', cd: 12, range: 900, who: 'npc', can: onlyHs,
  desc: '沉腰站定，周身一层金色罡气：这期间挨的那一下伤害大减、打不飞；随即罡气一圈反震出去，把身边的人震开。',
  begin(c) {
    const u = c.user; if (!u) return false;
    // r8-p1 加参考视频「霸体护甲」的表现（7.6 右拳前举的架势 → 8.0 两拳垂在身侧攥紧、挺胸，头顶一团白光、全身一圈粗金边，之后一直描着一圈细边）
    act(c, 'p1Armor', 2); c.data.hp0 = u.hp; c.data.absorbed = 0; c.data.hitAt = -1; c.data.ph = 0;
    c.B.body(u).iron = true;
    c.B.impact.aura(u, HSM.jingang.win + 0.4);
    say(c, '金刚不坏', '#ffd27a', true);
  },
  tick(c) {
    const u = c.user!, J = HSM.jingang, X = p1(c.B);
    sideCam(c, 0.3, 1.5);
    if (c.data.ph === 0 && !c.data.flare && c.t >= 0.2) {
      c.data.flare = 1;
      X.fx({ k: 'p1flare', x: u.x, y: u.y, color: '255,236,170', anchor: { x: u.x, y: u.y, offsetY: -(u.z + 175) } });
      X.outline(u, '255,214,90', 0.22, 7.5); X.sfx('p1armor', u.x, u.y);
    }
    if (c.data.ph === 0 && c.data.flare === 1 && c.t >= 0.42) { c.data.flare = 2; X.outline(u, '255,200,80', J.win, 3, 0.9); }
    if (c.data.ph === 0) {
      holdAt(c, P1T.armor.set);
      const b = c.B.body(u); b.poise = b.poiseMax; b.breakT = 0; b.staggerT = 0;
      // 硬吃：这期间掉的血退回八成五（「那一下伤害大减」），罡气不破
      const hp0 = c.data.hp0 as number;
      if (u.hp < hp0 - 0.5) {
        const loss = hp0 - u.hp, back = loss * J.cut;
        u.hp = Math.min(u.maxHp, u.hp + back); c.data.absorbed = (c.data.absorbed as number) + back;
        if ((c.data.hitAt as number) < 0) { c.data.hitAt = c.t; say(c, '硬吃！', '#ffd27a', false, null, 70); c.B.g.juice(0.04, 0.2); }
        const st = c.B.impact.stats as Record<string, number>; st.absorbed = (st.absorbed ?? 0) + back;
      }
      c.data.hp0 = u.hp;
      const hitAt = c.data.hitAt as number;
      if (c.t < J.win && !(hitAt >= 0 && c.t - hitAt > 0.22)) return true;
      // 反震
      c.data.ph = 1; c.data.t1 = c.t;
      c.B.body(u).iron = false;
      act(c, 'shout', 0.8);
      X.clear(u, 'rim'); X.outline(u, '255,240,180', 0.16, 6); X.fx({ k: 'p1flare', x: u.x, y: u.y, color: '255,220,140', anchor: { x: u.x, y: u.y, offsetY: -(u.z + 110) } });
      let units: import('./wreck').WreckHit[] = [];
      try { units = c.B.combat.wreck?.radial(u.x, u.y, J.R, 1.8, u, { mark: 'none' }).units ?? []; } catch { units = []; }
      c.B.impact.affect(c, units, { k: J.k, kind: 'hs-jingang', D: J.D, vz: J.vz });
      c.fx({ k: 'hsgold', x: u.x, y: u.y, r: J.R } as never);
      c.B.g.juice(0.05, 0.45); c.cam(0.6);
      return true;
    }
    return c.t - (c.data.t1 as number) < 0.4;
  },
  end(c) { if (c.user) { const b = c.B.peek(c.user); if (b) b.iron = false; if (c.data.ph === 0) p1(c.B).clear(c.user, 'rim'); } c.B.impact.auras = c.B.impact.auras.filter((a) => a.who !== c.user || a.t > a.dur - 0.31); },
};

/** 后发先至：对手重击出手的前摇里，他侧身一闪，一肘先到——把那一下打断 */
const houfa: SpecialMove = {
  id: 'houfa', name: '后发先至', glyph: '后', color: '255,236,200', cd: 6, range: 420, who: 'npc', can: onlyHs,
  desc: '对手重击出手的前摇里，他侧身一闪，一肘先到——那一下就此打断。',
  // r8-p1 换成参考视频「肘击」（13.74 侧身 → 13.87 提膝、右拳举到脑后 → 14.0 一帧切：大弓步前冲、右肘端平撞出 → 14.14 定住 → 14.2 收）：
  // 侧身一闪到对手横向一侧（画面上左右对打）、提膝蓄（0.06），0.13 一帧切出肘——肘尖一团蓝白冲击、后脚一团土、前脚炸一簇蓝光。命中的时刻和原来一样（0.13）
  begin(c) {
    const T = wpos(c, c.target); if (!T) return false;
    const u = upos(c), dx = T.x - u.x, dy = T.y - u.y, d = Math.hypot(dx, dy) || 1;
    let gx: number, gy: number;
    if (c.user && c.target) { const q = sideSpot(c, c.target, 120); gx = q.x; gy = q.y; }
    else {
      // 侧身：闪到对手出拳那条线的一侧，贴到肘能撞到的距离
      const nx = -dy / d, ny = dx / d, side = (c.user ? (c.user.id * 1000) & 1 : 0) ? 1 : -1;
      gx = T.x - dx / d * 70 + nx * HSM.houfa.side * side * 0.5; gy = T.y - dy / d * 70 + ny * HSM.houfa.side * side * 0.5;
    }
    c.data.gx = gx; c.data.gy = gy; c.data.sx = u.x; c.data.sy = u.y; c.data.done = 0;
    act(c, 'p1Elbow', 0.7); face(c, T.x - gx, T.y - gy);
    pin(c, c.target, 0.14);
  },
  tick(c) {
    const T = wpos(c, c.target);
    sideCam(c, 0.35, 1.8, 0.3);
    if (c.t < 0.08) { const k = c.t / 0.08; c.place(null, (c.data.sx as number) + ((c.data.gx as number) - (c.data.sx as number)) * k, (c.data.sy as number) + ((c.data.gy as number) - (c.data.sy as number)) * k); return true; }
    if (!c.data.done && c.t >= P1T.elbow.hit) {
      c.data.done = 1;
      if (!T) return false;
      // 弓步前冲：一帧往前送半个身位（贴到肘撞得到的地方）
      const u0 = upos(c), dir = Math.atan2(T.y - u0.y, T.x - u0.x), d0 = Math.hypot(T.x - u0.x, T.y - u0.y), go = clamp(d0 - 70, 0, 60);
      if (go > 0) c.place(null, u0.x + Math.cos(dir) * go, u0.y + Math.sin(dir) * go);
      const u = upos(c), X = p1(c.B);
      cut(c, 'eyes', '后发先至');
      interrupt(c, c.target, 0.5);
      if (c.hit(c.target, HSM.houfa.k, 'hs-houfa')) c.launch(c.target, Math.cos(dir), Math.sin(dir), HSM.houfa.D, HSM.houfa.vz);
      X.hit(c, c.target!, dir, 2, { arc: arcPts(c, c.target!, 'elbow'), col: '130,200,255', z: 112, snd: 'p1bash' });
      const ex = u.x + Math.cos(dir) * 46, ey = u.y + Math.sin(dir) * 46, fx = u.x + Math.cos(dir) * 30, fy = u.y + Math.sin(dir) * 30;
      X.fx({ k: 'p1sphere', x: ex, y: ey, r: 46, power: 1, color: '120,195,255', anchor: { x: ex, y: ey, offsetY: -(u.z + 112) } });
      X.fx({ k: 'p1dust', x: u.x - Math.cos(dir) * 40, y: u.y - Math.sin(dir) * 40, dir: dir + Math.PI, power: 0.9 });
      X.fx({ k: 'p1elec', x: fx, y: fy, r: 50, color: '110,190,255', anchor: { x: fx, y: fy, offsetY: -(u.z + 12) } });
      ink(c); c.B.g.juice(0.08, 0.45); c.cam(0.9);
      named(c, '后发先至', c.target);
    }
    return c.t < 0.55;
  },
};

/** 九招按 HS_BATCH1 的顺序 */
export const HS_MOVE_DEFS: Record<HsMoveId, SpecialMove> = { suodi, takong, yicunbeng, quanya, zhenjiao, qihe, kongshou, jingang, houfa };
for (const id of HS_BATCH1) registerMove(HS_MOVE_DEFS[id]);

/** 编排用：这一招眼下放不放得出（克制法修的那几招要有东西可接、可震） */
export function hsReady(B: BrawlSys, id: HsMoveId, user: Enemy, tg: Who | null): boolean {
  if ((user.skCd[id] ?? 0) > 0) return false;
  if (id === 'kongshou' || id === 'qihe') {
    const R = id === 'kongshou' ? 820 : HSM.qihe.R;
    const fake = { user, target: tg, B } as unknown as MoveCtx;
    return B.combat.projs.some((pr) => incoming(fake, pr, R));
  }
  if (id === 'houfa') return windingAt(B, tg);
  return true;
}
/** 对手是不是正在蓄重击 / 施法（后发先至的时机） */
export function windingAt(B: BrawlSys, tg: Who | null): boolean {
  if (!tg) return false;
  if (tg === 'p') return B.heavyWinding;
  const ai = B.peek(tg)?.ai;
  return (!!ai && ai.st === 'wind' && (ai.windK === 'h' || ai.windK === 'g')) || tg.windup > 0 || !!tg.cast;
}
void TAU;
