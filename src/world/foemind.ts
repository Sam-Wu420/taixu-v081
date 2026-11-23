// 第三十二步：敌人的“心智”——更聪明、更难缠
// · 护体灵光：看得见的灵光罩，先吃伤害；打碎时炸开碎光、对方僵直片刻（反击良机）
// · 遁光 / 血遁 / 雷遁 / 魔影遁：修士远了御器疾追，近了瞬移到你侧后
// · 走位：踩进你的领域会跳出来；妖兽群分头包抄；重伤时护体、呼救、撤退（妖兽撤开后怒而回扑）
// · 趁隙：你施法收招的空当，对手出招更快
import type { Combat, Enemy } from './combat';
import { isBoss, kitOf } from './foeskills';
import { audio } from './audio';
import { REALMS } from '../data/realms';
import { gearOf, type FoeGear } from './foegear';
import { engageSpeed } from './chasespeed';
import { ITEMS } from '../data/items';

const TAU = Math.PI * 2;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

export type DunKind = 'sword' | 'blood' | 'thunder' | 'demon' | 'earth';
export interface Ward { hp: number; max: number; col: string; t: number }
export interface MindOut { busy: boolean; mx: number; my: number; sp: number; w: number }

const OUT: MindOut = { busy: false, mx: 0, my: 0, sp: 1, w: 1 };
function out(busy: boolean, mx: number, my: number, sp: number, w = 1) { OUT.busy = busy; OUT.mx = mx; OUT.my = my; OUT.sp = sp; OUT.w = w; return OUT; }

/** 受击高度（护体灵光罩的中心） */
export function wardY(e: Enemy) { return e.def.kind === 'human' ? 62 : e.anim.flying ? 80 : 44 * (e.def.look?.size ?? 1); }
export function wardR(e: Enemy) { return e.def.kind === 'human' ? 62 : 56 * (e.def.look?.size ?? 1); }

/** 修士的遁法：魔修血遁 / 鬼道魔影遁 / 其余剑遁，结丹以上偶用雷遁 */
export function dunOf(e: Enemy): DunKind {
  if (e.dunKind) return e.dunKind;
  const r = e.def.ranged?.fx, col = e.def.ranged?.color ?? '';
  e.dunKind = e.def.evil ? (r === 'ghost' || col.startsWith('170,90') ? 'demon' : 'blood') : e.realm >= 3 && Math.random() < 0.5 ? 'thunder' : 'sword';
  return e.dunKind;
}
export const DUN_COL: Record<DunKind, string> = { sword: '170,240,255', blood: '230,40,60', thunder: '170,180,255', demon: '170,90,230', earth: '200,170,110' };
const DUN_NAME: Record<DunKind, string> = { sword: '遁！', blood: '血遁！', thunder: '雷遁！', demon: '魔影遁！', earth: '土遁！' };

export function giveWard(c: Combat, e: Enemy, frac: number, col: string, say = true, label = '护体灵光') {
  const amt = e.maxHp * frac;
  e.ward = { hp: amt, max: amt, col, t: 0.6 };
  c.fxq.push({ k: 'ward', anchor: { x: e.x, y: e.y, offsetY: -e.flyH - e.lift }, x: e.x, y: e.y - wardY(e), color: col, r: wardR(e) });
  if (say) c.texts.push({ x: e.x, y: e.y - 130, s: label, color: `rgb(${col})`, t: 0, vy: -26 });
  if (say || label === '护体灵光') audio.sfx('chime');
}

/** 伤害先打在护体灵光上；返回穿透的部分 */
export function absorbWard(c: Combat, e: Enemy, d: number): number {
  const w = e.ward; if (!w || w.hp <= 0) return d;
  const a = Math.min(w.hp, d);
  w.hp -= a; w.t = 0.3;
  if (w.hp <= 0) {
    e.ward = undefined;
    c.fxq.push({ k: 'shatter', anchor: { x: e.x, y: e.y, offsetY: -e.flyH - e.lift }, x: e.x, y: e.y - wardY(e), color: w.col, r: wardR(e) });
    c.texts.push({ x: e.x, y: e.y - 150, s: ((e as any).wardName ?? '护体灵光') + '·破！', color: '#fff0c0', t: 0, vy: -30, big: true });
    e.st.stun = { t: 0.7, dps: 0 };   // 灵光反噬，僵直片刻
    c.game.juice(0.05, 0.25); audio.sfx('break');
  } else c.fxq.push({ k: 'block', anchor: { x: e.x, y: e.y, offsetY: -e.flyH - e.lift }, x: e.x + rand(-20, 20), y: e.y - wardY(e) + rand(-20, 20), color: w.col });
  return d - a;
}

/** 瞬移（血遁 / 雷遁 / 魔影遁 / 土遁） */
export function blinkTo(c: Combat, e: Enemy, x: number, y: number, kind: DunKind, label?: string) {
  // 第四十一步：被镇压时遁术施展不开
  if (e.sup >= 2) { if (Math.random() < 0.5) c.texts.push({ x: e.x, y: e.y - 130, s: '遁术被压制！', color: '#d8c8a0', t: 0, vy: -22 }); return; }
  if (!c.mind.canStand(e, x, y, false)) return;
  if (kind === 'blood') c.fxq.push({ k: 'xueying', x: e.x, y: e.y, x2: x, y2: y });
  else c.fxq.push({ k: 'dunflash', x: e.x, y: e.y, x2: x, y2: y, kind, color: DUN_COL[kind] });
  e.x = x; e.y = y; e.kx = 0; e.ky = 0;
  if (e.cs) { e.cs.x = x; e.cs.y = y; }
  e.trailReset = true;
  c.texts.push({ x, y: e.y - 130, s: label ?? DUN_NAME[kind], color: `rgb(${DUN_COL[kind]})`, t: 0, vy: -26 });
  audio.sfx(kind === 'thunder' ? 'thunder' : 'whoosh');
}

// 第三十七步：瞬移闪避——筑基靠身法、结丹化遁光、元婴真正的瞬移（原设：元婴修士方能短距瞬移，耗费不小）
//   [_, 炼气, 筑基, 结丹, 元婴, 化神]
const EV_CH = [0, 0, 0.18, 0.3, 0.45, 0.6], EV_R = [0, 0, 160, 260, 380, 420], EV_CD = [0, 0, 6, 4, 2.5, 2], EV_N = [0, 0, 1, 2, 3, 3];
const EV_NAME = ['', '', '身法', '遁光', '瞬移', '瞬移'];
const RE_T = 8;   // 每 8 秒回一次
// v0.70 亡命遁逃：触发血线 / 几率 / 奔逃速度倍率 / 遁术间隔（按境界：凡人 炼气 筑基 结丹 元婴 化神）
const FLEE_HP = [0.18, 0.2, 0.22, 0.25, 0, 0];
const FLEE_P = [0.6, 0.8, 0.9, 0.95, 0, 0];   // 斗法版：残血几乎必逃
// 斗法版：身法已按境界同表，这里是「基础身法」上的倍率——亡命时约为你平飞的一成一快，催动遁光才追得上
const FLEE_SPEED = [1.6, 1.95, 2.15, 2.15, 2.3, 2.3];
// 斗法版 遁光：平飞（≈ 你御器平飞）/ 全力催动（≈ 你催动遁光）
const DUN_FLY = 2.0, DUN_BOOST = 3.0;
// 斗法版 灵气护罩：入战即撑起——占气血上限的比例 / 碎后可再凝的次数 / 再凝间隔（凡人 炼气 筑基 结丹 元婴 化神）
const WARD_F = [0, 0.1, 0.17, 0.24, 0.42, 0.46], WARD_N = [0, 1, 2, 3, 5, 6], WARD_CD = [0, 22, 17, 15, 9, 8];   // 元婴 / 化神加强：罩更厚、再凝更快更多次
const FLEE_BLINK = [9, 9, 3.4, 2.6, 2, 2];
const FLEE_NAME = ['', '', '土遁', '血遁', '瞬移', '瞬移'];

export class FoeMind {
  constructor(public c: Combat) {}

  /** 修士的瞬移闪避：法术临身的一刹那遁开（返回 true = 这一击落空） */
  evade(e: Enemy, fx: number, fy: number, raw: number): boolean {
    const c = this.c, g = c.game;
    if ((e as { noMind?: boolean }).noMind) return false;
    if (e.def.kind !== 'human' || e.spar || e.realm < 2 || e.dead || e.cast) return false;
    const st = e.st; if (st.stun || st.freeze || st.root || e.sup >= 2) return false;
    const r = Math.min(5, e.realm);
    if (e.evadeN < 0) e.evadeN = EV_N[r];
    if (e.evadeCd > 0 || e.evadeN <= 0 || e.evRoll > 0) return false;
    e.evRoll = 0.35;   // 连段打击不会每一下都判一次
    const gap = e.realm - g.hero.realm;
    const gm = gap >= 2 ? 1.5 : gap === 1 ? 1.2 : gap === 0 ? 1 : gap === -1 ? 0.35 : 0;   // v0.64：只高一境，身法上占不了那么大便宜
    if (!gm) return false;
    const ch = Math.min(0.75, EV_CH[r] * (raw > e.maxHp * 0.12 ? 1.5 : 1) * gm * (isBoss(e) ? 1.2 : 1) * (e.pursuer ? 1.3 : 1));
    if (Math.random() >= ch) return false;
    const p = g.player;
    let nx = 0, ny = 0, ok = false;
    // 元婴：一半的时候直接闪到你身后
    if (r >= 4 && Math.random() < 0.5) {
      const yaw = p.st?.yaw ?? 0;
      nx = p.x - Math.cos(yaw) * 140; ny = p.y - Math.sin(yaw) * 110;
      ok = this.canStand(e, nx, ny);
    }
    if (!ok) {
      const ux = e.x - p.x, uy = e.y - p.y, ul = Math.hypot(ux, uy) || 1;
      let ax = e.x - fx, ay = e.y - fy, al = Math.hypot(ax, ay);
      if (al < 20) { ax = ux; ay = uy; al = ul; }
      for (const side of Math.random() < 0.5 ? [1, -1] : [-1, 1]) {
        const dx = (-uy / ul) * side * 0.8 + (ax / al) * 0.6, dy = (ux / ul) * side * 0.8 + (ay / al) * 0.6, dl = Math.hypot(dx, dy) || 1;
        nx = e.x + (dx / dl) * EV_R[r]; ny = e.y + (dy / dl) * EV_R[r] * 0.8;
        if (this.canStand(e, nx, ny)) { ok = true; break; }
      }
    }
    if (!ok) return false;
    e.evadeN--; e.evadeCd = EV_CD[r];
    blinkTo(c, e, nx, ny, dunOf(e), EV_NAME[r]);
    if (r >= 3) e.skT = Math.min(e.skT, 0.25);   // 闪开即反击
    e.aggro = true;
    return true;
  }

  /** 能否站在那里（飞行的、海里的各有规矩；不进城镇） */
  canStand(e: Enemy, x: number, y: number, avoidSafe = true) {
    const c = this.c, T = c.game.terrain;
    if (avoidSafe && c.safeAt(x, y)) return false;
    if (e.def.flying) return true;
    if (!T.surface.sample(x, y).walkable) return false;
    if (e.def.kind === 'human' && e.realm >= 2) return true;
    return e.sea ? !T.isLand(x, y) : T.walkFactor(x, y) > 0;
  }

  /** 每帧：返回移动建议（busy = 本帧不出招，只顾走位） */
  tick(e: Enemy, dt: number, tx: number, ty: number, dist: number, rooted: boolean, onPlayer: boolean): MindOut | null {
    const c = this.c, g = c.game;
    if ((e as { noMind?: boolean }).noMind) return null;   // 木人桩 / 陪练：不入心智 AI（不撑护罩、不闪避、不施法、不逃）
    if (e.def.kind === 'human' && !(e as any).gearOn) this.gearUp(e);   // 斗法版：入战撑起灵气护罩、亮出心法与法器
    if (e.def.kind === 'human') this.treasures(e, dt, dist, onPlayer);   // 鞋履 / 宝甲 / 护盾 / 丹药：看局势随手就用
    if (e.ward && e.ward.t > 0) e.ward.t = Math.max(0, e.ward.t - dt);
    if (e.wardRe > 0 && !e.ward) { e.wardRe -= dt; if (e.wardRe <= 0) { const W = e as any; giveWard(c, e, e.wardFrac * 0.6, e.wardCol ?? '240,220,140', true, W.wardName ?? '护体灵光'); W.wardN = (W.wardN ?? 1) - 1; if (W.wardN > 0) e.wardRe = W.wardCd ?? 18; } }   // 斗法版：可再凝数次
    // 趁隙：你施法收招的空当，对手出招更快
    if (onPlayer && c.castT > 0.05) e.skT -= dt * 1.5;
    // 瞬移次数慢慢回复
    if (e.evadeN >= 0) { e.evadeCd -= dt; e.evRoll -= dt; const mx = EV_N[Math.min(5, e.realm)]; if (e.evadeN < mx && (e.evadeRe += dt) >= RE_T) { e.evadeRe = 0; e.evadeN++; } }
    const human = e.def.kind === 'human' && !e.spar;
    const boss = isBoss(e) && !e.pursuer;
    // 见高人而退：被你的威压压在原地（差两个大境界，正是要「见高人而退」的那些人）也照样认怂求饶，威压一松就逃。
    // 原来这一条排在「被镇压就什么都不想」之后，镇压一落下（每 0.15 秒重算）劫修就再也不会认怂——能不能认怂全看压制先落还是心智先跑
    if (rooted && !e.cast && human && onPlayer && !boss && !e.pursuer && !e.wing && !e.tag && !(e as any).warRos && !e.cowered && !e.provoked && !g.concealed && g.hero.realm >= e.realm + 2) {
      e.cowered = true; e.retreatT = 40;
      c.texts.push({ x: e.x, y: e.y - 140, s: g.hero.realm >= 4 ? pick(['元婴老怪！快逃！', '前辈饶命！']) : pick(['前辈饶命！', '晚辈有眼无珠！', '告辞、告辞！']), color: '#ffe0b0', t: 0, vy: -22 });
    }
    if (rooted || e.cast) { e.dun = Math.max(0, e.dun - dt * 3); return null; }
    const dx = tx - e.x, dy = ty - e.y, L = dist || 1;
    // 第三十七步：见了高人而退的、元婴遁走的，远离之后就此消失
    if ((e.cowered && !e.provoked && dist > 1700) || (e.fled && dist > 1500)) { e.gone = true; if (e.fled) g.toast(`${e.name}遁光一闪，已逃得无影无踪。`, 'info'); return out(true, 0, 0, 0); }
    // 1) 踩进你的领域：跳出来
    if (!boss && (human || e.blv >= 3 || e.realm >= 2)) {
      let fx = 0, fy = 0, inF = false;
      for (const f of c.fields) {
        if (f.heal || f.dmg <= 0) continue;
        const ox = e.x - f.x, oy = e.y - f.y, od = Math.hypot(ox, oy);
        if (od < f.r * 1.05) { inF = true; fx += ox / (od || 1); fy += oy / (od || 1); }
      }
      if (inF && human && e.realm >= 3 && e.fieldT > 0.1) {
        if (e.evadeN < 0) e.evadeN = EV_N[Math.min(5, e.realm)];
        if (e.evadeN > 0 && e.evadeCd <= 0) {
          const l = Math.hypot(fx, fy) || 1, R = 300 + Math.random() * 80, nx = e.x + fx / l * R, ny = e.y + fy / l * R * 0.8;
          if (this.canStand(e, nx, ny)) { e.evadeN--; e.evadeCd = EV_CD[Math.min(5, e.realm)]; e.fieldT = 0; blinkTo(c, e, nx, ny, dunOf(e), EV_NAME[Math.min(5, e.realm)]); return null; }
        }
      }
      if (inF) { e.fieldT += dt; if (e.fieldT > (human ? 0.25 : 0.55)) { const l = Math.hypot(fx, fy) || 1; if (human && e.realm >= 2) e.dun = Math.min(1, e.dun + dt * 4); return out(true, fx / l, fy / l, human ? 1.8 : 1.35); } }
      else e.fieldT = 0;
    }
    // 2) 撤退中
    if (e.retreatT > 0) {
      e.retreatT -= dt;
      if (human && e.realm >= 2) e.dun = Math.min(1, e.dun + dt * 3);
      if (e.retreatT <= 0 && !human) { e.atk *= 1.15; e.speed *= 1.1; c.texts.push({ x: e.x, y: e.y - 120, s: '怒！', color: '#ff7a5a', t: 0, vy: -26, big: true }); e.skT = 0; }
      // v0.70：亡命遁逃——筑基起一路遁术接连施展（土遁 / 血遁 / 遁光 / 瞬移），每遁一次都拉开一大截
      const E = e as any;
      if (human && e.fled && e.realm >= 2) {
        E.fleeBlink = (E.fleeBlink ?? 0.4) - dt;
        if (E.fleeBlink <= 0) {
          E.fleeBlink = FLEE_BLINK[Math.min(5, e.realm)] * rand(0.8, 1.2);
          const a = Math.atan2(-dy, -dx) + rand(-0.45, 0.45), R = rand(260, 380) + e.realm * 60;
          for (const k of [1, 0.7, 0.45]) { const nx = e.x + Math.cos(a) * R * k, ny = e.y + Math.sin(a) * R * k * 0.8; if (this.canStand(e, nx, ny)) { if (dunOf(e) === 'blood') e.hp = Math.max(1, e.hp - e.maxHp * 0.04); blinkTo(c, e, nx, ny, dunOf(e), FLEE_NAME[Math.min(5, e.realm)]); break; } }
        }
      }
      return out(true, -dx / L, -dy / L, human ? (E.dunK ?? (e.realm >= 2 ? 2.0 : 1.6)) : 1.4);
    }
    // 半血法宝尽出：剩下的若是音钟、火旗等近身法器，先压进它的射程，不能隔着几百丈把这件法宝漏掉
    const EA = e as any;
    if (human && onPlayer && EA.artLow) {
      const pending = kitOf(e).filter((s) => s.id.startsWith('fq_') && !EA.lowArtUsed?.[s.id]);
      if (pending.length && pending.every((s) => dist > s.range)) {
        if (e.realm >= 2) e.dun = Math.min(1, e.dun + dt * 4);
        return out(true, dx / L, dy / L, e.realm >= 2 ? 2.0 : 1.6);
      }
    }
    // 临阵换宝：轮到音钟、火旗这类近身法宝，而趁手的远程法宝都在冷却——主动压进射程再祭。
    // 真人不会隔着几百丈干等冷却，把近身法宝揣一整场。压两三息压不进去就作罢，等下一轮。
    if (human && onPlayer && e.realm >= 2 && !EA.artLow && EA.artOpened && (EA.artCad ?? 9) < 1.2 && !e.cast && !e.fled && e.hp > e.maxHp * 0.25) {
      const rdy = kitOf(e).filter((s) => s.id.startsWith('fq_') && s.k !== 'guard' && (e.skCd[s.id] ?? 0) <= 0);
      if (rdy.length && rdy.every((s) => dist > s.range)) {
        EA.closeT = (EA.closeT ?? 0) + dt;
        if (EA.closeT < 2.6) { e.dun = Math.min(1, e.dun + dt * 4); return out(true, dx / L, dy / L, e.pursuer ? 1.15 : 2.0); }
        EA.closeT = 0; EA.artCad = 2.5;
      } else EA.closeT = 0;
    }
    // 3) 重伤：护体、呼救、撤退
    const hpK = e.hp / e.maxHp;
    // 3·前) v0.70 亡命遁逃：修士残血往死里跑，神行符 / 土遁 / 血遁 / 遁光全用上，跑出一千五百丈便逃得无影无踪
    //   （元婴不在此列：元婴打到肉身被毁，元婴破体而出再战 / 再逃，见 combat.kill）
    if (human && !e.fled && e.realm <= 3 && hpK < FLEE_HP[e.realm] && !boss && !e.pursuer && !e.minion && !e.spar && !e.tag && !e.ally && !(e as any).warRos && !(e as any).noFlee) {
      (e as any).noFlee = true;
      if (Math.random() < FLEE_P[e.realm]) {
        e.fled = true; e.retreatT = 99; (e as any).dunK = FLEE_SPEED[e.realm]; (e as any).fleeBlink = 0.15;
        if (e.realm >= 2) { e.dun = 1; if (!e.ward) giveWard(c, e, 0.15, e.def.evil ? '230,80,90' : '240,220,140'); }
        c.texts.push({ x: e.x, y: e.y - 140, s: e.realm <= 1 ? pick(['神行符，走！', '撤！', '好汉不吃眼前亏！']) : e.realm === 2 ? pick(['土遁！', '风紧，扯呼！', '今日不陪你玩了！']) : pick(['血遁！', '小辈，你给我等着！', '此仇必报！']), color: '#ffd0a0', t: 0, vy: -22, big: true });
        if (Math.hypot(e.x - g.player.x, e.y - g.player.y) < 1600) g.toast(`${e.name}${e.realm >= 3 ? '施展血遁' : e.realm === 2 ? '施展遁术' : '拍出一张神行符'}，亡命而逃——追上去，别让他跑了！`, 'warn');
        return out(true, -dx / L, -dy / L, FLEE_SPEED[e.realm]);
      }
    }
    if (!e.lowDone && hpK < (human ? 0.35 : 0.25) && !boss && !e.minion && !e.yieldAt) {
      e.lowDone = true;
      if (human) {
        if (e.realm >= 2 && !e.ward) giveWard(c, e, 0.28, e.def.evil ? '230,80,90' : '240,220,140');
        let n = 0;
        for (const o of e.ally ? c.allies : c.enemies) if (o !== e && !o.dead && !o.aggro && o.def.kind === 'human' && !o.spar && o.team === e.team && Math.hypot(o.x - e.x, o.y - e.y) < 1800) { o.aggro = true; n++; }
        c.texts.push({ x: e.x, y: e.y - 140, s: n ? '同门何在，助我！' : pick(['可恶……', '好厉害的小辈！', '今日算我栽了！']), color: '#ffd0a0', t: 0, vy: -20 });
        if (Math.random() < 0.5 && !e.pursuer) {
          e.retreatT = rand(2, 3.2);
          if (e.realm >= 2 && Math.random() < 0.6) { const a = Math.atan2(-dy, -dx) + rand(-0.5, 0.5), R = rand(380, 520), nx = e.x + Math.cos(a) * R, ny = e.y + Math.sin(a) * R * 0.75; if (this.canStand(e, nx, ny)) blinkTo(c, e, nx, ny, dunOf(e)); }
        }
      } else if (e.blv >= 3 && Math.random() < 0.6) {
        e.retreatT = rand(1.8, 2.8);
        c.texts.push({ x: e.x, y: e.y - 110, s: '嗷——', color: '#e8c8a0', t: 0, vy: -24 });
      }
    }
    // 3b) 元婴老怪重伤：瞬移数百丈，遁走（原设：元婴修士最难杀，打不过就跑）。排在诈败之前：两成血的元婴是真跑，不是诈败
    //     （原来诈败在前，四成概率先布了伏兵、本帧就返回，之后撤退中又轮不到这一条，元婴老怪就不遁走了）
    if (human && e.realm >= 4 && hpK < 0.2 && !e.fled && !boss && !e.pursuer && !e.tag && !(e as any).warRos) {
      e.fled = true; e.retreatT = 99;
      const a = Math.atan2(-dy, -dx) + rand(-0.4, 0.4);
      for (const R of [600, 450, 300]) { const nx = e.x + Math.cos(a) * R, ny = e.y + Math.sin(a) * R * 0.8; if (this.canStand(e, nx, ny)) { blinkTo(c, e, nx, ny, dunOf(e), '瞬移遁走'); break; } }
      c.texts.push({ x: e.x, y: e.y - 150, s: '小辈，后会有期！', color: '#ffd0a0', t: 0, vy: -20 });
      return out(true, -dx / L, -dy / L, 2.4);
    }
    // 3a) 江湖篇·诈败：狠辣的人修血量四成时假装遁逃，把你引进同伙的包围圈（神识外放能提前看见伏兵）
    if (human && onPlayer && e.def.evil && e.realm >= 2 && hpK < 0.42 && !boss && !e.pursuer && !e.minion && !e.spar && !(e as any).feint && !(e as any).noFeint && !(e as any).warRos && g.jianghu) {
      (e as any).noFeint = true;   // 每个敌人只判一次
      if (Math.random() < 0.4 && !c.enemies.some((o) => (o as any).ambusher && !o.dead)) {
        const a = Math.atan2(-dy, -dx) + rand(-0.3, 0.3);
        g.jianghu.layAmbush(e, Math.cos(a), Math.sin(a));
        if (e.realm >= 2 && Math.random() < 0.5) { const R = rand(300, 420), nx = e.x + Math.cos(a) * R, ny = e.y + Math.sin(a) * R * 0.75; if (this.canStand(e, nx, ny)) blinkTo(c, e, nx, ny, dunOf(e)); }
        return out(true, -dx / L, -dy / L, 1.6);
      }
    }
    if ((e as any).feint && e.retreatT > 0) { e.retreatT -= dt; if (e.realm >= 2) e.dun = Math.min(1, e.dun + dt * 3); return out(true, -dx / L, -dy / L, 1.5); }
    // 3b) 元婴老怪重伤遁走——v0.70 起停用：元婴死战到肉身被毁，元婴再破体而出（combat.kill）
    if (false && human && e.realm >= 4 && hpK < 0.2 && !e.fled && !boss && !e.pursuer && !e.tag && !(e as any).warRos) {
      e.fled = true; e.retreatT = 99;
      const a = Math.atan2(-dy, -dx) + rand(-0.4, 0.4);
      for (const R of [600, 450, 300]) { const nx = e.x + Math.cos(a) * R, ny = e.y + Math.sin(a) * R * 0.8; if (this.canStand(e, nx, ny)) { blinkTo(c, e, nx, ny, dunOf(e), '瞬移遁走'); break; } }
      c.texts.push({ x: e.x, y: e.y - 150, s: '小辈，后会有期！', color: '#ffd0a0', t: 0, vy: -20 });
      return out(true, -dx / L, -dy / L, 2.4);
    }
    // 3c) 见高人而退：高你两个大境界的前辈，散修劫修不敢招惹（敛息时看不穿）
    if (human && onPlayer && !boss && !e.pursuer && !e.wing && !e.tag && !(e as any).warRos && !e.cowered && !e.provoked && !g.concealed && g.hero.realm >= e.realm + 2) {
      e.cowered = true; e.retreatT = 40;
      c.texts.push({ x: e.x, y: e.y - 140, s: g.hero.realm >= 4 ? pick(['元婴老怪！快逃！', '前辈饶命！']) : pick(['前辈饶命！', '晚辈有眼无珠！', '告辞、告辞！']), color: '#ffe0b0', t: 0, vy: -22 });
      if (e.realm >= 2) e.dun = 1;
      return out(true, -dx / L, -dy / L, 2.2);
    }
    // 4) 修士：遁光疾追 / 瞬移侧翼 / 各司其职
    if (human) {
      e.blinkCd -= dt;
      // 斗法版 遁光：筑基以上——远了催动遁光疾追（你也在飞遁时全力催动）；近了仍驾着遁光走位出手。炼气以轻身术 / 神行符疾行
      const pst = g.player.st, pv = onPlayer && pst ? Math.hypot(pst.vx, pst.vy) : 0;
      const pFast = onPlayer && (g.player.boosting || pv > REALMS[Math.min(5, g.hero.realm)].speed * 1.5);
      let spK = 1;
      if (e.realm >= 2) {
        if (dist > 720 && !e.pursuer && !e.busy) {
          e.dun = Math.min(1, e.dun + dt * 4);
          const boost = pFast || dist > 1100, E = e as any;
          if (boost && onPlayer && !(E.dunSayT > g.time)) { E.dunSayT = g.time + 14; c.texts.push({ x: e.x, y: e.y - 140, s: pick(['催动遁光！', '哪里走！', '遁光·疾！']), color: `rgb(${DUN_COL[dunOf(e)]})`, t: 0, vy: -24 }); }
          const lt = Math.min(0.8, dist / 900), ax = tx + (onPlayer ? g.player.st.vx * lt : 0) - e.x, ay = ty + (onPlayer ? g.player.st.vy * lt : 0) - e.y, al = Math.hypot(ax, ay) || 1;
          return out(true, ax / al, ay / al, boost ? DUN_BOOST : DUN_FLY);
        }
        if (dist > 170 || pFast) { e.dun = Math.min(1, e.dun + dt * 3); if (!e.pursuer) spK = pFast ? 1.8 : 1.3; }
        else e.dun = Math.max(0, e.dun - dt * 2);
      } else {
        e.dun = Math.max(0, e.dun - dt * 2);
        if (dist > 320 && !e.pursuer) spK = pFast ? 1.75 : 1.5;
      }
      // 追杀 / 劫道 / 寻仇的真人：你拔腿就跑而没催遁光时，同境 / 高境者的身法不低于你（口径同 chasespeed.ts）——
      // 不再出现“对方驾着遁光，却被步行的你越甩越远”。催动遁光仍能拉开同境，低境者照旧追不上高境。
      if (onPlayer && !e.pursuer && (e as any).hunter && pv > 60) {
        const need = engageSpeed(e.speed, e.realm, e.stage, { v: pv, flying: !!g.player.flying, boosting: !!g.player.boosting, realm: g.hero.realm });
        spK = Math.max(spK, Math.min(3.4, need / Math.max(1, e.speed)));
        if (e.realm >= 2 && pv > 200) e.dun = Math.min(1, e.dun + dt * 3);
      }
      if ((e as any).mvT > 0 && !(onPlayer && g.player.boosting)) spK *= 1.4;   // 踏着鞋履 / 遁器：数息内身法暴涨（追不了催动遁光的你——保命遁光不被抵消）
      if (e.realm >= 2 && e.blinkCd <= 0 && dist > 260 && dist < 1000 && !(e.pursuer && onPlayer && g.player.boosting) && Math.random() < dt * 0.9) {
        e.blinkCd = (e.realm >= 4 ? rand(4, 7) : e.realm >= 3 ? rand(6, 10) : rand(8, 13)) * (e.pursuer ? 0.75 : 1);
        let nx: number, ny: number;
        if (e.realm >= 4 && onPlayer) {
          // 元婴：瞬移到你背后（你面朝的反方向）
          const yaw = (g.player.st?.yaw ?? 0) + Math.PI + rand(-0.5, 0.5), R = rand(150, 230);
          nx = tx + Math.cos(yaw) * R; ny = ty + Math.sin(yaw) * R * 0.75;
        } else {
          const side = Math.random() < 0.5 ? 1 : -1, a = Math.atan2(e.y - ty, e.x - tx) + side * rand(0.9, 1.7), R = rand(220, 320);
          nx = tx + Math.cos(a) * R; ny = ty + Math.sin(a) * R * 0.75;
        }
        if (this.canStand(e, nx, ny)) { blinkTo(c, e, nx, ny, dunOf(e), e.realm >= 4 ? '瞬移' : undefined); if (e.realm >= 3) e.skT = Math.min(e.skT, 0.35); }
      }
      // 护法：照看受伤的同伴
      e.supCd -= dt;
      if (e.role === 'support' && e.supCd <= 0) {
        let worst: Enemy | null = null, wk = 0.65;
        for (const o of e.ally ? c.allies : c.enemies) if (o !== e && !o.dead && o.aggro && o.def.kind === 'human' && o.team === e.team && o.hp / o.maxHp < wk && Math.hypot(o.x - e.x, o.y - e.y) < 700) { wk = o.hp / o.maxHp; worst = o; }
        if (worst) {
          e.supCd = rand(8, 11);
          if (!worst.ward && e.realm >= 2 && Math.random() < 0.5) giveWard(c, worst, 0.18, '150,230,170', false);
          else { worst.hp = Math.min(worst.maxHp, worst.hp + worst.maxHp * 0.18); c.vfx.push({ kind: 'aura', anchor: { x: worst.x, y: worst.y, offsetY: -worst.flyH - worst.lift }, x: worst.x, y: worst.y, r: 90, t: 0, dur: 0.9, color: '150,230,120' } as any); }
          c.texts.push({ x: e.x, y: e.y - 130, s: '回春术', color: '#a8e8a0', t: 0, vy: -24 });
          c.texts.push({ x: worst.x, y: worst.y - 120, s: '+', color: '#a8e8a0', t: 0, vy: -30, big: true });
        }
      }
      return spK !== 1 ? out(false, 0, 0, spK, 0) : null;   // 斗法版：驾遁光走位
    }
    // 5) 妖兽群：分头包抄，从不同方向扑上来
    if (e.def.melee && !boss && dist > 150 && dist < 760) {
      let pack = 0;
      for (const o of c.enemies) if (o !== e && !o.dead && o.aggro && o.def.melee && o.def.kind !== 'human' && Math.abs(o.x - tx) < 900 && Math.abs(o.y - ty) < 900) pack++;
      if (pack >= 1) {
        e.slotA ??= (((e.id * 9301) % 1) + 1) % 1 * TAU;
        const R = e.def.melee.range * 0.9 + 50, sx = tx + Math.cos(e.slotA) * R, sy = ty + Math.sin(e.slotA) * R * 0.7;
        const ox = sx - e.x, oy = sy - e.y, ol = Math.hypot(ox, oy) || 1;
        return out(false, ox / ol, oy / ol, 1.12, 0.75);
      }
    }
    return null;
  }

  /** 斗法版：入战——撑起灵气护罩（碎了隔一阵还能再凝，次数随境界），亮出本宗心法与法器 */
  private gearUp(e: Enemy) {
    const c = this.c, g = c.game, E = e as any;
    E.gearOn = true;
    const gr = gearOf(e); if (!gr) return;
    const r = Math.min(5, e.realm), near = Math.hypot(e.x - g.player.x, e.y - g.player.y) < 1500;
    const nameOf = (f: (k: string) => boolean) => { const id = gr.arts.find((x) => { const k = ITEMS[x]?.art?.kind; return !!k && f(k); }); return id ? ITEMS[id].name.replace(/（.*?）/g, '') : ''; };
    const sh = nameOf((k) => k === 'shield'), mv = nameOf((k) => k === 'boots') || nameOf((k) => k === 'flight' || k === 'wings'), am = nameOf((k) => k === 'armor');
    if (!e.ward && !e.wardFrac) {
      const col = e.def.evil ? '230,90,110' : '130,215,255';
      e.wardFrac = WARD_F[r] + gr.wardK; e.wardCol = col; e.wardRe = WARD_CD[r];
      // 身上真有盾类法器：入战祭出的就是这面盾（结丹起点名），而不是笼统一句“灵气护罩”
      const label = sh && r >= 3 ? `祭·${sh}` : '灵气护罩';
      E.wardName = label; E.wardN = WARD_N[r]; E.wardCd = WARD_CD[r];
      giveWard(c, e, e.wardFrac, col, near, label);
    }
    if (near) c.texts.push({ x: e.x, y: e.y - 164, s: `「${gr.gongfa}」${gr.arts.length ? ` 法器×${gr.arts.length}` : ''}`, color: '#cfe6ff', t: 0, vy: -14 });
    // 元婴老怪的家底要看得见：入战就把鞋履踏上、宝甲披上（指名道姓），随后由法宝轮转 / treasures() 逐件使用。
    if (near && r >= 4) {
      const marks = [mv ? `踏·${mv}` : '', am ? `披·${am}` : ''].filter(Boolean);
      if (marks.length) c.texts.push({ x: e.x, y: e.y - 146, s: marks.join('　'), color: '#ffe3a8', t: 0, vy: -12 });
    }
  }

  /**
   * 真人做派：鞋履 / 宝甲 / 护盾 / 丹药不是摆设——看局势随手就用（人修专属；筑基起，元婴最勤）。
   *   · 鞋履 / 遁器：你要跑、或自己挨了重手 → 踏上，数息内身法 ×1.4，并多一次闪避；
   *   · 宝甲：挨打掉血 → 灵光护体（短暂大幅减伤）；
   *   · 护盾：灵光罩被打碎 → 立刻再祭一面；
   *   · 丹药：气血见底 → 服下储物袋里的疗伤丹（吃一颗少一颗，斩杀后掉落也相应变少）。
   * 这些都是瞬发的“随手动作”，不占出招节奏，所以不会挤掉法宝轮转与本门法术。
   */
  private treasures(e: Enemy, dt: number, dist: number, onPlayer: boolean) {
    const c = this.c, g = c.game, E = e as any;
    const gr = E.gear as FoeGear | undefined;
    if (!gr || e.dead || e.spar || e.realm < 2) return;
    const r = Math.min(5, e.realm), hi = r >= 4;
    if (E.trInit === undefined) {
      E.trInit = 1;
      const nameOf = (f: (k: string) => boolean) => { const id = gr.arts.find((x) => { const k = ITEMS[x]?.art?.kind; return !!k && f(k); }); return id ? ITEMS[id].name.replace(/（.*?）/g, '') : ''; };
      E.mvArt = nameOf((k) => k === 'boots') || nameOf((k) => k === 'flight' || k === 'wings'); E.amArt = nameOf((k) => k === 'armor'); E.shArt = nameOf((k) => k === 'shield');
      E.mvCd = rand(1.5, 4); E.amCd = 0; E.shCd = rand(3, 6); E.pillCd = 0; E.pillN = hi ? 3 : r >= 3 ? 2 : 1; E.mvT = 0;
    }
    E.mvCd -= dt; E.amCd -= dt; E.shCd -= dt; E.pillCd -= dt;
    if (E.mvT > 0) {
      E.mvT -= dt;
      if (Math.random() < dt * 14) c.sparks.push({ x: e.x + rand(-16, 16), y: e.y - rand(0, 14), vx: rand(-30, 30), vy: -rand(20, 60), t: 0, max: rand(0.25, 0.5), size: 4, color: '170,225,255' });
    }
    const st = e.st;
    if (st.stun || st.freeze || e.sup >= 2 || !e.aggro) return;
    const hpK = e.hp / e.maxHp, hurt = g.time - e.lastHitBy < 0.6;
    const say = (s: string, col: string) => c.texts.push({ x: e.x, y: e.y - 152, s, color: col, t: 0, vy: -22 });
    // 鞋履 / 遁器
    if (E.mvArt && E.mvCd <= 0 && !st.root) {
      const ps = g.player.st, pv = onPlayer && ps ? Math.hypot(ps.vx, ps.vy) : 0;
      if ((onPlayer && dist > 420 && pv > 200 && !g.player.boosting) || (hurt && hpK < 0.85)) {
        E.mvCd = hi ? rand(7, 10) : r >= 3 ? rand(11, 14) : rand(15, 19); E.mvT = hi ? 4 : 3;
        if (e.evadeN >= 0) e.evadeN++; e.evadeCd = Math.min(e.evadeCd, 0.3);
        e.dun = 1; say(`踏·${E.mvArt}`, '#bfe9ff'); audio.sfx('whoosh');
        c.vfx.push({ kind: 'ring', x: e.x, y: e.y, r: 70, t: 0, dur: 0.4, color: '170,225,255' } as any);
      }
    }
    // 宝甲
    if (E.amArt && E.amCd <= 0 && hurt && hpK < 0.78 && e.guardT <= 0) {
      E.amCd = hi ? rand(11, 14) : rand(16, 20); e.guardT = Math.max(e.guardT, hi ? 2.6 : 2.0);
      say(`${E.amArt}·灵光护体`, '#f0d890'); audio.sfx('chime');
      c.fxq.push({ k: 'ward', x: e.x, y: e.y - wardY(e), color: '240,216,144', r: wardR(e) });
    }
    // 护盾：灵光罩碎了，立刻再祭一面
    if (E.shArt && E.shCd <= 0 && !e.ward && hpK < 0.97 && !e.cast) {
      E.shCd = hi ? rand(10, 13) : r >= 3 ? rand(15, 18) : rand(20, 24);
      giveWard(c, e, Math.max(0.1, (e.wardFrac || 0.2) * (hi ? 0.6 : 0.45)), e.wardCol ?? '225,205,135', true, `祭·${E.shArt}`);
    }
    // 丹药（已经伤到「该亡命遁逃」的分上就别再嗑药了——先逃命，别把遁逃时机拖过去）
    const fleeFloor = e.def.kind === 'human' && r <= 3 ? FLEE_HP[r] : 0;
    if (E.pillN > 0 && E.pillCd <= 0 && hpK < 0.42 && hpK >= fleeFloor && !e.cast) {
      const it = gr.items.find((x) => x.id === 'pill_liaoshang' && x.n > 0);
      if (it) {
        it.n--; E.pillN--; E.pillCd = rand(9, 12);
        const heal = Math.round(e.maxHp * (hi ? 0.1 : 0.12)); e.hp = Math.min(e.maxHp, e.hp + heal);
        say(`服下·${ITEMS[it.id]?.name ?? '疗伤丹'}`, '#a8e8a0');
        c.vfx.push({ kind: 'aura', x: e.x, y: e.y, r: 90, t: 0, dur: 0.9, color: '150,230,120' } as any);
        c.texts.push({ x: e.x, y: e.y - 120, s: `+${heal}`, color: '#a8e8a0', t: 0, vy: -30 });
      } else E.pillN = 0;
    }
  }

  /** 修士入战时分派职责：远攻 / 近战 / 护法 */
  assignRole(e: Enemy) {
    if (e.role || e.def.kind !== 'human') return;
    const k = Math.floor(e.id * 1000) % 5;
    e.role = !e.def.melee && k === 0 && e.realm >= 1 ? 'support' : e.def.melee ? 'tank' : 'ranged';
  }
}
