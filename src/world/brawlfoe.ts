// 敌人和 NPC 的近战（E2）：world/brawl.ts 的「另一半」。
//   · 招式类型 'brawl'（foeskills.ts）：AI 选到「欺身连击」时交给这里——扑过去、贴身连打，罡气打空了就轰飞；
//   · 体修散修流派、青玄门 / 断刀坞 / 重岳剑门 / 玄煞宗各配一两手近战（schools.ts）；五阶以上的走兽会扑上来连咬带甩；
//   · 三连节奏不再固定：两拳后接抓投、佯攻后撤、你脱困后追一手；
//   · 对手也可以是别的 NPC（派系混战里体修真的近战：npcHit、互相轰飞、两边同时欺身就拼招）；
//   · 流派克制：欺身路上撞上阵地招式（剑阵、火墙、留在地上的持续范围技）被拦下——冲刺中断、吃伤害、短硬直；
//     所以法修 / 剑修被体修盯上时会后撤，并在来路上放一片范围技（kite）。
// 随机数一律用近战自己的序列（brnd）；伤害一律走 hitEnemy / hitPlayer / npcHit。
import type { Enemy } from './combat';
import type { BrawlSys, Body } from './brawl';
import type { FoeSkill, El, Hz } from './foeskills';
import { EL_COL, isBoss, kitOf } from './foeskills';
import { SCHOOLS } from './schools';
import { brnd, brange } from './brawlrng';
import { audio } from './audio';
import { foeKind } from './brawlarms';
import { WEAPONS, type WeaponKind } from '../data/weapons';
import { WEAPON_MOVES, ACTION_HIT, type Action } from '../gfx/character';
import { MOVES, type SpecialMove } from './brawlmoves';

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/** 会近战的单位的出手状态 */
export interface BrawlAI {
  st: 'idle' | 'rush' | 'combo' | 'wind' | 'back';
  t: number; n: number; cd: number; sx: number; sy: number;
  /** 这一套的招式序列（j 拳、b 咬、h 重击、g 抓投、t 甩、f 佯攻）与走到第几下 */
  pat: string; i: number;
  /** 对手：null = 主角 */
  tg: Enemy | null;
  /** 自己驱动（试玩 / 测试的体修原型）；否则由招式（foeskills 的 'brawl'）发起 */
  proto: boolean;
  /** 走兽（扑咬连甩）、伤害倍率 */
  beast: boolean; pow: number;
  /** 前摇剩余与蓄的是哪一下 */
  wind: number; windK: string;
  /** 上一次「你脱困后追一手」的时刻；第几套（原型的第一套固定是两拳一记重击） */
  chased: number; sets: number;
  /** 兵器线：重击前摇里还要「蓄着不动」多久（重兵抡起、枪往后引，看得出要砸了）；轻击走到兵器连段的第几下；枪的突刺（一条直线：方向、还剩多远） */
  hold: number; wi: number; line: { ux: number; uy: number; left: number } | null;
}
export function newAI(proto: boolean, beast: boolean): BrawlAI {
  return { st: 'idle', t: 0, n: 0, cd: proto ? 1 + brnd() : 0, sx: 0, sy: 0, pat: '', i: 0, tg: null, proto, beast, pow: 1, wind: 0, windK: '', chased: -99, sets: 0, hold: 0, wi: 0, line: null };
}
/** 敌人拿兵器打你时多给的前摇（看得懂：重兵抡起来停一停、枪往后一引；剑快，只多一点） */
const TELL: Record<WeaponKind, number> = { fist: 0, sword: 0.1, heavy: 0.38, spear: 0.22, scythe: 0.26 };
/** 枪的突刺起手前的预警（地上一条线） */
const SPEAR_TELL = 0.45;

/** 一下的伤害（攻力倍数）、削罡气、前摇 */
const HIT: Record<string, { k: number; poise: number; wind: number; name: string }> = {
  j: { k: 0.55, poise: 20, wind: 0, name: 'npc-light' },
  b: { k: 0.6, poise: 22, wind: 0, name: 'npc-bite' },
  h: { k: 1.2, poise: 45, wind: 0.3, name: 'npc-heavy' },
  g: { k: 0.9, poise: 38, wind: 0.24, name: 'npc-grab' },
  t: { k: 0.85, poise: 34, wind: 0.2, name: 'npc-toss' },
  f: { k: 0, poise: 0, wind: 0.22, name: 'npc-feint' },
};

/** 阵地：欺身路上撞上就被拦下 */
interface Barrier { dmg: number; realm: number; color: string; school?: string; src?: Enemy; mine: boolean; x: number; y: number }

export class FoeBrawl {
  private kiteT = 0;
  private kcd = new WeakMap<Enemy, number>();
  constructor(readonly B: BrawlSys) {}
  private get c() { return this.B.combat; }
  private get g() { return this.B.combat.game; }

  /** 会不会近战（招式里有 'brawl'，或者挂了近战 AI） */
  isBrawler(e: Enemy) { return !!this.B.peek(e)?.ai || !!e.kit?.some((s) => s.k === 'brawl'); }

  /**
   * foeskills 的 FoeAI.tick 在挑招之前问一句：要不要出「欺身连击」。用近战自己的随机数决定，
   * 不出就返回 false，老路径照常打分挑招（一个 Math.random 都不多取）。
   */
  start(e: Enemy, sk: FoeSkill, tx: number, ty: number, dist: number): boolean {
    if (dist > sk.range || (e.skCd[sk.id] ?? 0) > 0 || e.sup >= 2 || (e as { shell?: boolean }).shell) return false;
    const B = this.B, b = B.body(e);
    if (b.air || b.staggerT > 0 || b.subT > 0 || B.clash.st?.e === e) return false;
    const tgt = e.tgP ? null : e.tgE ?? null;
    if (!tgt && (B.pb.air || B.pSubT > 0 || this.g.hero.dead)) return false;
    const tixiu = e.school === 'tixiu';
    const want = (dist < 420 ? 0.75 : 0.5) * (tixiu || b.ai?.beast ? 1.25 : 1);
    if (brnd() > want) return false;
    // 挂进来的特殊招式（brawlmoves）：按权重和寻常的贴身连击一起挑（没注册招式时一个随机数都不多取）
    if (MOVES.size) { const mv = this.pickMove(e, dist); if (mv && B.startMove(mv, e, tgt ?? 'p')) { e.skCd[sk.id] = sk.cd * 0.6; e.skT = 1.4; this.c.texts.push({ x: e.x, y: e.y - 135, s: mv.name, color: '#ffb08a', t: 0, vy: -18 } as never); return true; } }
    const ai = b.ai ?? (b.ai = newAI(false, e.def.kind !== 'human'));
    if (!b.aiMarked) { b.aiMarked = true; b.poiseMax = B.poiseMaxOf(e); b.poise = b.poiseMax; }
    B.track(e);
    ai.tg = tgt; ai.pow = sk.pow || 1; ai.pat = this.pattern(e, ai); ai.i = 0; ai.t = 0; ai.n = 0;
    e.skCd[sk.id] = sk.cd * brange(0.9, 1.15);
    e.skT = (e.def.kind === 'human' ? 1.8 : 2.2) * brange(0.8, 1.2);
    e.lastSk = sk.id;
    void tx; void ty;
    this.c.texts.push({ x: e.x, y: e.y - (e.def.kind === 'human' ? 135 : 120), s: sk.name, color: '#ffb08a', t: 0, vy: -18 } as never);
    if (dist > 150) this.beginRush(e, ai); else { ai.st = 'combo'; ai.t = 0.12; }
    return true;
  }

  /** 特殊招式里挑一招（权重：寻常连击算 1） */
  private pickMove(e: Enemy, dist: number): SpecialMove | null {
    const list: SpecialMove[] = [];
    let sum = 1;
    for (const m of MOVES.values()) {
      if (!m.ai || m.who === 'player' || (e.skCd[m.id] ?? 0) > 0 || (m.can && !m.can(this.B, e))) continue;
      if (dist < (m.ai.min ?? 0) || dist > (m.ai.max ?? m.range ?? 600)) continue;
      list.push(m); sum += m.ai.weight;
    }
    if (!list.length) return null;
    let r = brnd() * sum;
    for (const m of list) { r -= m.ai!.weight; if (r < 0) return m; }
    return null;
  }
  /** 这一套怎么打：原型的第一套固定两拳一记重击（测试靠它）；其余在几种变招里挑。拿兵器的不抓投（抓投换成一下轻击） */
  private pattern(e: Enemy, ai: BrawlAI): string {
    const s = this.pattern0(e, ai);
    return !ai.beast && foeKind(e) !== 'fist' ? s.replace(/g/g, 'j') : s;
  }
  private pattern0(e: Enemy, ai: BrawlAI): string {
    ai.sets++;
    if (ai.beast) return brnd() < 0.55 ? 'bbt' : 'bbbt';
    if (ai.proto && ai.sets === 1) return 'jjh';
    const r = brnd(), hi = e.realm >= 3;
    if (r < 0.34) return 'jjh';
    if (r < 0.62) return 'jjg';
    if (r < 0.84) return hi ? 'fjjh' : 'fjh';
    return hi ? 'jjjh' : 'jjh';
  }

  /** 对手现在在哪（主角：脚底和身子的高度） */
  private target(e: Enemy, ai: BrawlAI): { x: number; y: number; z: number } | null {
    if (ai.tg) { const o = ai.tg; if (o.dead || o.gone || (o.hideT ?? 0) > 0) return null; return { x: o.x, y: o.y, z: o.z }; }
    const g = this.g, p = g.player;
    if (g.hero.dead || this.B.pSubT > 0) return null;
    return { x: p.x, y: p.y, z: p.z + this.B.playerLift };
  }

  private beginRush(e: Enemy, ai: BrawlAI) {
    const B = this.B, T = this.target(e, ai); if (!T) { ai.st = 'idle'; return; }
    ai.line = null;
    // 拿枪的：突刺——先往后一引、地上亮一条预警线（沿用招式预警的画法），再沿这条线直直扎过去
    if (!ai.beast && foeKind(e) === 'spear') {
      const dx = T.x - e.x, dy = T.y - e.y, d = Math.hypot(dx, dy) || 1, len = Math.min(1300, d + 220), ang = Math.atan2(dy, dx);
      ai.st = 'wind'; ai.windK = 'r'; ai.wind = SPEAR_TELL; ai.hold = SPEAR_TELL; ai.t = 0;
      ai.line = { ux: dx / d, uy: dy / d, left: len };
      e.cs?.restart('spearR');
      this.c.foe.hz.push({ k: 'line', x: e.x, y: e.y, ang, len, w: 70, r: 0, spread: 0, t: 0, tele: SPEAR_TELL, dur: 0, el: 'metal', dmg: 0, realm: e.realm, src: e, fired: false, tick: 0, vis: true } as never);
      return;
    }
    ai.st = 'rush'; ai.t = 0; ai.sx = e.x; ai.sy = e.y;
    this.c.fxq.push({ k: 'rush', anchor: { x: e.x, y: e.y, offsetY: -e.z }, x: e.x, y: e.y - 60, x2: T.x, y2: T.y - 60, color: ai.beast ? '255,150,90' : '255,170,110' });
    audio.sfx('whoosh', e.x, e.y);
    // 盯上的是个法修 / 剑修：它后撤、在来路上放一片范围技
    if (ai.tg) this.kiteFrom(ai.tg, e.x, e.y);
    void B;
  }

  /** 每帧（brawl.update 里，会近战的单位） */
  tick(e: Enemy, b: Body, dt: number) {
    const ai = b.ai!, B = this.B, c = this.c, g = this.g;
    if (B.clash.st?.e === e) return;
    if (b.staggerT > 0 || b.freezeT > 0 || b.subT > 0 || e.st.stun || e.st.freeze || e.st.root || e.sup >= 2) { if (b.staggerT > 0 || e.st.stun || e.st.freeze) { ai.st = 'idle'; ai.wind = 0; ai.line = null; ai.hold = 0; } ai.cd = Math.max(ai.cd, 0.3); return; }
    if (ai.proto && !e.aggro) { ai.st = 'idle'; return; }
    // 原型：在混战里打别人时，对手跟着寻常 AI 的选择走
    if (ai.st === 'idle') ai.tg = e.tgP ? null : e.tgE ?? null;
    const T = this.target(e, ai);
    if (!T) { if (ai.st !== 'idle') this.finish(e, ai); return; }
    const dx = T.x - e.x, dy = T.y - e.y, d = Math.hypot(dx, dy) || 1;
    const wk: WeaponKind = ai.beast ? 'fist' : foeKind(e);
    const reach = (wk === 'fist' ? 95 : WEAPONS[wk].feel.reach * 0.85) + (ai.beast ? 16 * (e.def.look?.size ?? 1) : 0);
    const close = d < reach && Math.abs(T.z - e.z) < 140;
    const tAir = ai.tg ? B.isAir(ai.tg) : B.pb.air;
    ai.t += dt;
    switch (ai.st) {
      case 'idle': {
        // 你刚脱困：凡是会近战的都追一手（原型和招式驱动的都算）
        if (!ai.tg && B.techAt > ai.chased && g.time - B.techAt < 0.7 && d < 1000 && d > 140 && !B.pb.air && !g.hero.dead) {
          ai.chased = g.time; ai.pat = ai.beast ? 'bt' : 'jh'; ai.i = 0; B.track(e);
          c.texts.push({ x: e.x, y: e.y - 130, s: '休走！', color: '#ffb08a', t: 0, vy: -24 } as never);
          this.beginRush(e, ai); return;
        }
        if (!ai.proto) return;
        ai.cd -= dt;
        if (ai.cd > 0 || tAir || c.invulnT > 0.2) return;
        ai.pat = this.pattern(e, ai); ai.i = 0;
        if (close) { ai.st = 'combo'; ai.t = 0.1; ai.n = 0; return; }
        if (d < 900 && d > 150) this.beginRush(e, ai);
        return;
      }
      case 'rush': {
        // 两边同时欺身：主角正扑向它 → 拼招；对手是个也在扑过来的 NPC → NPC 之间拼招
        if (!ai.tg && B.rushingAt(e) && d < 260 && B.clash.can(e)) { ai.line = null; B.clash.start(e, 'rush'); return; }
        if (ai.line) { this.thrust(e, b, ai, dt, T); return; }
        if (ai.tg && d < 220) { const ob = B.peek(ai.tg); if (ob?.ai?.st === 'rush' && ob.ai.tg === e && B.clash.can(e) && B.clash.can(ai.tg)) { const win = B.clash.npcClash(e, ai.tg); const loser = win === e ? ai.tg : e; const la = B.peek(loser)?.ai; if (la) la.st = 'idle'; if (win === e) { ai.st = 'combo'; ai.t = 0; } else ai.st = 'idle'; return; } }
        const step = Math.min(d - 70, 2000 * dt);
        if (step > 0) {
          const nx = e.x + dx / d * step, ny = e.y + dy / d * step;
          const air = e.def.flying || e.flyH > 20 || (e.canFly && T.z > 30);
          if (air || (g.terrain.walkFactor(nx, ny) > 0 && g.terrain.canTraverse(e.x, e.y, nx, ny))) { e.x = nx; e.y = ny; }
          else { this.finish(e, ai, 1.2); return; }
          if (e.canFly && !e.def.flying) e.flyH += (Math.max(0, T.z) - e.flyH) * Math.min(1, dt * 8);   // 会御器的：跟着对手的高度扑
          // 阵地：撞上就被拦下
          const bar = this.barrier(e.x, e.y, e, ai.sx, ai.sy);
          if (bar) { this.blocked(e, b, ai, bar); return; }
        }
        if (e.cs) { e.cs.x = e.x; e.cs.y = e.y; }
        e.facing = dx > 0 ? 1 : -1;
        const tr = b.trail; tr.push([e.x, e.y, -e.z - 50]); if (tr.length > 24) tr.shift();
        if (close || d < reach) { ai.st = 'combo'; ai.t = 0.12; ai.n = 0; b.trail.length = 0; }
        else if (ai.t > 0.7) this.finish(e, ai, 1.4);
        return;
      }
      case 'back': {
        // 佯攻后撤：倒退一步再扑上来
        const k = Math.min(1, ai.t / 0.26), sp = 1100 * (1 - k * 0.6);
        const nx = e.x - dx / d * sp * dt, ny = e.y - dy / d * sp * dt;
        if (e.def.flying || e.flyH > 20 || (g.terrain.walkFactor(nx, ny) > 0 && g.terrain.canTraverse(e.x, e.y, nx, ny))) { e.x = nx; e.y = ny; }
        if (e.cs) { e.cs.x = e.x; e.cs.y = e.y; }
        if (ai.t > 0.3) this.beginRush(e, ai);
        return;
      }
      case 'wind': {
        // 前摇：重击蓄力（和你的重击撞上就拼招）、抓、甩、佯攻
        ai.wind -= dt;
        if (ai.windK === 'h' && !ai.tg && B.heavyWinding && d < 230 && B.clash.can(e)) { B.clash.start(e, 'heavy'); return; }
        if (ai.wind > 0) return;
        const k = ai.windK; ai.st = 'combo'; ai.t = 0;
        if (k === 'f') { ai.st = 'back'; ai.t = 0; c.texts.push({ x: e.x, y: e.y - 120, s: '虚晃', color: '#e8d8b0', t: 0, vy: -24 } as never); return; }
        if (k === 'r') { ai.st = 'rush'; ai.t = 0; ai.sx = e.x; ai.sy = e.y; c.fxq.push({ k: 'rush', anchor: { x: e.x, y: e.y, offsetY: -e.z }, x: e.x, y: e.y - 60, x2: e.x + ai.line!.ux * 400, y2: e.y + ai.line!.uy * 400 - 60, color: '255,190,130' }); audio.sfx('wswing_spear', e.x, e.y); return; }
        if (!close || tAir) { this.whiff(e, ai, k); return; }
        this.strike(e, b, ai, k, dx / d, dy / d);
        return;
      }
      case 'combo': {
        if (ai.t < 0.22) return;
        ai.t = 0;
        if (ai.i >= ai.pat.length) { this.finish(e, ai); return; }
        if (!close || tAir) {
          // 对手退开了：还没打完就再扑一次（一套最多扑两次），否则收手
          if (d < 700 && !tAir && ai.n < 1) { ai.n++; this.beginRush(e, ai); return; }
          this.finish(e, ai, 1.2); return;
        }
        const k = ai.pat[ai.i++];
        const H = HIT[k];
        if (wk !== 'fist' && (k === 'j' || k === 'h')) { this.wWind(e, b, ai, k, wk); return; }
        if (H.wind > 0) {
          ai.st = 'wind'; ai.wind = H.wind; ai.windK = k;
          if (e.cs) e.cs.restart(k === 'h' ? 'smash' : k === 'g' ? 'grab' : k === 'f' ? 'feint' : 'punch');   // 第三轮：抓投、佯攻各有自己的架子
          c.fxq.push({ k: 'bxcharge', anchor: { x: e.x, y: e.y, offsetY: -e.z }, x: e.x, y: e.y - 60, color: k === 'h' ? '255,140,80' : k === 'f' ? '230,230,230' : '255,190,120', power: k === 'h' ? 2 : 1, r: H.wind });
          return;
        }
        if (e.cs) e.cs.restart('punch');
        this.strike(e, b, ai, k, dx / d, dy / d);
        return;
      }
    }
  }

  private finish(e: Enemy, ai: BrawlAI, cd = 0) {
    ai.st = 'idle'; ai.wind = 0; ai.i = 0; ai.line = null; ai.hold = 0;
    ai.cd = ai.proto ? Math.max(cd, 1.8 + brnd() * 1.2) : cd;
    void e;
  }
  private whiff(e: Enemy, ai: BrawlAI, k: string) {
    this.c.fxq.push({ k: 'bxhit', x: e.x + (e.facing || 1) * 50, y: e.y - 60, color: '230,230,230', power: 0.4 });
    ai.cd = Math.max(ai.cd, 0.6);
    void k;
  }

  /**
   * 拿兵器的起手：播那种兵器的动作，前摇到动作的出手那一刻（兵器谱的 at）；重击再多蓄一会儿（TELL，蓄着不动，看得出要砸了），
   * 重兵整段霸体、地上亮一圈要砸到的范围。轻击按兵器连段轮着出。
   */
  private wWind(e: Enemy, b: Body, ai: BrawlAI, k: string, wk: WeaponKind) {
    const F = WEAPONS[wk].feel, c = this.c, M = WEAPON_MOVES[wk];
    let a: Action, at: number, tell = 0;
    if (k === 'j') { const i = ai.wi++ % F.light.length; a = M.light[i % M.light.length]; at = F.light[i].at; }
    else { a = M.heavy[0]; at = F.heavy.at; tell = TELL[wk]; }
    ai.st = 'wind'; ai.windK = k; ai.wind = at + tell; ai.hold = tell;
    e.cs?.restart(a);
    if (F.armor) b.armorT = Math.max(b.armorT, ai.wind + 0.05);
    if (k === 'h') {
      c.fxq.push({ k: 'bxcharge', anchor: { x: e.x, y: e.y, offsetY: -e.z }, x: e.x, y: e.y - 60, color: wk === 'heavy' ? '255,120,60' : '255,170,100', power: 2, r: ai.wind });
      const T = this.target(e, ai);
      if (wk === 'heavy' && T) this.c.foe.hz.push({ k: 'circle', x: e.x + (T.x - e.x) * 0.6, y: e.y + (T.y - e.y) * 0.6, r: (F.quake?.r ?? 260) * 0.75, ang: 0, spread: 0, len: 0, w: 0, t: 0, tele: ai.wind, dur: 0, el: 'earth', dmg: 0, realm: e.realm, src: e, fired: false, tick: 0, vis: true } as never);
    }
    audio.sfx(wk === 'sword' ? 'wswing_sword' : wk === 'heavy' ? 'wswing_heavy' : 'wswing_spear', e.x, e.y);
  }
  /** 枪的突刺：沿预警线直直扎过去，线上碰到对手就扎中（一套里的头一下），扎到头没碰到就收手 */
  private thrust(e: Enemy, b: Body, ai: BrawlAI, dt: number, T: { x: number; y: number; z: number }) {
    const L = ai.line!, g = this.g, step = Math.min(L.left, 2600 * dt);
    const nx = e.x + L.ux * step, ny = e.y + L.uy * step;
    const air = e.def.flying || e.flyH > 20;
    if (!air && !(g.terrain.walkFactor(nx, ny) > 0 && g.terrain.canTraverse(e.x, e.y, nx, ny))) { ai.line = null; this.finish(e, ai, 1.2); return; }
    e.x = nx; e.y = ny; L.left -= step;
    if (e.cs) { e.cs.x = e.x; e.cs.y = e.y; e.cs.faceToward(L.ux, L.uy, false); }
    const tr = b.trail; tr.push([e.x, e.y, -e.z - 50]); if (tr.length > 24) tr.shift();
    const dx = T.x - e.x, dy = T.y - e.y, side = Math.abs(dx * L.uy - dy * L.ux), along = dx * L.ux + dy * L.uy;
    if (along > -30 && along < 120 && side < 70 && Math.abs(T.z - e.z) < 140) { ai.line = null; b.trail.length = 0; this.strike(e, b, ai, 'r', L.ux, L.uy); ai.st = 'combo'; ai.t = 0; ai.n = 1; return; }
    if (L.left <= 0) { ai.line = null; b.trail.length = 0; this.finish(e, ai, 1.2); }
  }

  /** 一下落到对手身上 */
  private strike(e: Enemy, b: Body, ai: BrawlAI, k: string, ux: number, uy: number) {
    const wk: WeaponKind = ai.beast ? 'fist' : foeKind(e);
    if (wk !== 'fist' && (k === 'j' || k === 'h' || k === 'r')) { this.wStrike(e, b, ai, k, ux, uy, wk); return; }
    const B = this.B, c = this.c, g = this.g, H = HIT[k];
    const heavy = k === 'h', throwK = k === 'g' || k === 't';
    if (!ai.tg) {
      const p = g.player;
      const landed = B.hurtPlayer(e.atk * H.k * ai.pow, e.realm, e.x, e.y, e, H.name);
      c.fxq.push({ k: 'bxhit', anchor: { x: p.x, y: p.y, offsetY: -p.z - B.playerLift }, x: p.x - ux * 20, y: p.y - 62, color: ai.beast ? '255,150,110' : '255,190,130', power: heavy ? 2.5 : throwK ? 2 : 1, dir: Math.atan2(uy, ux) });
      if (!landed) return;
      const gk = clamp(Math.pow(1.5, e.realm - g.hero.realm), 0.3, 2.5);
      B.poiseDmg(B.pb, H.poise * gk, null);
      const fz = heavy || throwK ? 0.085 : 0.055;
      if (!(B.pb.armorT > 0 && !heavy && !throwK)) { B.pb.freezeT = Math.max(B.pb.freezeT, fz); b.freezeT = Math.max(b.freezeT, fz); }   // 你在重兵的霸体里：轻的打不停你
      B.holdPlayer(heavy ? 0.35 : 0.2, heavy || throwK);
      // E3：虚空斗法里罡气被打空、脚下够得着一界——体修 / 会近战的大妖一记重击（走兽是叼住一甩）把你砸进下界
      if ((heavy || k === 't') && B.pb.breakT > 0 && g.xukong.fall.canDropPlayer(e)) g.xukong.fall.dropPlayer(e);
      else if (heavy && B.pb.breakT > 0) { B.launchPlayer(ux, uy, 1700, 340, e); g.juice(0.06, 0.4); }
      else if (k === 'g') {
        // 抓投：一把揪住，从肩上甩到身后
        p.x = e.x - ux * 30; p.y = e.y - uy * 30;
        B.launchPlayer(ux, uy, 900, 560, e);
        c.texts.push({ anchor: { x: e.x, y: e.y, offsetY: -e.z }, x: e.x, y: e.y - 150, s: '抓投！', color: '#ffb070', t: 0, vy: -26, big: true } as never);
        g.juice(0.05, 0.35);
      } else if (k === 't') {
        // 连咬带甩：叼住一甩，甩飞一小段
        const sx = -uy * (brnd() < 0.5 ? 1 : -1), sy = ux;
        B.launchPlayer(ux * 0.6 + sx * 0.8, uy * 0.6 + sy * 0.8, 650, 380, e);
        g.juice(0.04, 0.3);
      }
      return;
    }
    // 对手是 NPC：走 npcHit；轰飞 / 抓投 / 甩也照样打在它身上
    const o = ai.tg, ob = B.body(o);
    c.npcHit(e, o, e.atk * H.k * ai.pow, e.realm, undefined, e.x, e.y);
    c.fxq.push({ k: 'bxhit', anchor: { x: o.x, y: o.y, offsetY: -o.z }, x: o.x - ux * 18, y: o.y - c.hitY(o), color: '255,200,140', power: heavy ? 2.2 : throwK ? 1.8 : 0.9, dir: Math.atan2(uy, ux) });
    if (o.dead) return;
    const gk = clamp(Math.pow(1.5, e.realm - o.realm), 0.3, 2.5);
    B.poiseDmg(ob, H.poise * gk, o);
    const fz = heavy || throwK ? 0.085 : 0.055;
    ob.freezeT = Math.max(ob.freezeT, fz); b.freezeT = Math.max(b.freezeT, fz);
    ob.staggerT = Math.max(ob.staggerT, heavy ? 0.4 : 0.22);
    B.track(o);
    if ((heavy && ob.breakT > 0) || throwK) B.launch(o, ux, uy, heavy ? 1500 : k === 'g' ? 800 : 600, heavy ? 320 : 520, e, e.realm, e.atk, false);
  }

  /** 拿兵器的一下：照那种兵器的谱算伤血和削罡；剑的重击带剑气、重兵砸地起震波、枪的重击把人挑起来；突刺（r）是一记重的直刺 */
  private wStrike(e: Enemy, b: Body, ai: BrawlAI, k: string, ux: number, uy: number, wk: WeaponKind) {
    const B = this.B, c = this.c, g = this.g, F = WEAPONS[wk].feel;
    const heavy = k === 'h' || k === 'r';
    const S = F.light[Math.max(0, ai.wi - 1) % F.light.length];
    const dmgK = k === 'h' ? F.heavy.dmg * 0.8 : k === 'r' ? F.rush.dmg * 0.9 : S.dmg;
    const poise = k === 'h' ? F.heavy.poise * 1.07 : k === 'r' ? F.rush.poise : S.poise * 1.1;
    const name = k === 'h' ? 'npc-wheavy' : k === 'r' ? 'npc-thrust' : 'npc-wlight';
    const col = B.metalRGB(wk, e.look?.weapon?.tier ?? 2);
    if (k === 'h' && wk === 'sword') B.qiWave(e.x + ux * 60, e.y + uy * 60, e.z + 50, ux, uy, e, e.atk * ai.pow, e.realm, F.wave!);
    if (k === 'h' && wk === 'heavy' && F.quake) B.quake(e.x + ux * 90, e.y + uy * 90, F.quake, e, e.atk * ai.pow, e.realm, null);
    if (!ai.tg) {
      const p = g.player;
      const landed = B.hurtPlayer(e.atk * dmgK * ai.pow, e.realm, e.x, e.y, e, name);
      c.fxq.push({ k: 'bxwhit', anchor: { x: p.x, y: p.y, offsetY: -p.z - B.playerLift }, x: p.x - ux * 20, y: p.y - 62, color: col, power: heavy ? 2.5 : 1.2, dir: Math.atan2(uy, ux), kind: wk });
      audio.sfx(wk === 'sword' ? 'whit_sword' : wk === 'heavy' ? 'whit_heavy' : 'whit_spear', p.x, p.y);
      if (!landed) return;
      const gk = clamp(Math.pow(1.5, e.realm - g.hero.realm), 0.3, 2.5);
      B.poiseDmg(B.pb, poise * gk, null);
      const fz = heavy ? 0.09 : 0.05;
      if (!(B.pb.armorT > 0 && !heavy)) { B.pb.freezeT = Math.max(B.pb.freezeT, fz); b.freezeT = Math.max(b.freezeT, fz); }
      B.holdPlayer(heavy ? 0.35 : 0.2, heavy);
      if (heavy && B.pb.breakT > 0 && g.xukong.fall.canDropPlayer(e)) g.xukong.fall.dropPlayer(e);
      else if (heavy && B.pb.breakT > 0) {
        if (wk === 'spear' && k === 'h') B.launchPlayer(ux, uy, 420, 1250, e);   // 枪：把你挑上天
        else B.launchPlayer(ux, uy, 1700 * F.launchK, 340, e);
        g.juice(0.06, 0.4);
      }
      return;
    }
    const o = ai.tg, ob = B.body(o);
    c.npcHit(e, o, e.atk * dmgK * ai.pow, e.realm, undefined, e.x, e.y);
    c.fxq.push({ k: 'bxwhit', anchor: { x: o.x, y: o.y, offsetY: -o.z }, x: o.x - ux * 18, y: o.y - c.hitY(o), color: col, power: heavy ? 2.2 : 1, dir: Math.atan2(uy, ux), kind: wk });
    if (o.dead) return;
    const gk = clamp(Math.pow(1.5, e.realm - o.realm), 0.3, 2.5);
    B.poiseDmg(ob, poise * gk, o);
    const fz = heavy ? 0.09 : 0.05;
    ob.freezeT = Math.max(ob.freezeT, fz); b.freezeT = Math.max(b.freezeT, fz);
    ob.staggerT = Math.max(ob.staggerT, heavy ? 0.4 : 0.22);
    B.track(o);
    if (heavy && ob.breakT > 0) { if (wk === 'spear' && k === 'h') B.launch(o, ux, uy, 300, 1150, e, e.realm, e.atk, false); else B.launch(o, ux, uy, 1500 * F.launchK, 320, e, e.realm, e.atk, false); }
  }

  /**
   * 阵地：这一点有没有挡住欺身的东西。who = 正在扑的 NPC（null = 主角）；(fx, fy) = 起扑点（本来就站在阵里的不算撞上）。
   * 主角扑：敌方留在地上的持续范围技（火墙、毒瘴、剑雨的余势……）、敌修布下的阵；
   * NPC 扑：你的持续范围技（fields）、你和友人布的阵、以及它的对手留在地上的范围技。
   */
  barrier(x: number, y: number, who: Enemy | null, fx: number, fy: number): Barrier | null {
    const c = this.c, g = this.g, F = c.foe;
    const hzOn = (h: Hz) => h.k === 'circle' && h.dmg > 0 && ((h.fired && (h.pool ?? 0) > 0) || (!h.fired && h.t > h.tele * 0.5 && (h.pool ?? 0) > 0));
    if (who) {
      for (const f of c.fields) if (!f.heal && f.dmg > 0 && Math.hypot(x - f.x, (y - f.y) * 1.3) < f.r && Math.hypot(fx - f.x, (fy - f.y) * 1.3) >= f.r) return { dmg: f.dmg * 1.6, realm: f.realm, color: f.color, school: f.school, mine: true, x: f.x, y: f.y };
      for (const z of g.zhenfa.list) if (!z.dead && z.owner !== 'e' && g.zhenfa.inside(z, x, y) && !g.zhenfa.inside(z, fx, fy)) return { dmg: c.pStats.atk * 1.2, realm: g.hero.realm, color: '200,230,255', mine: true, x: z.x, y: z.y };
      for (const h of F.hz) if (hzOn(h) && h.src && h.src !== who && c.hostile(h.src, who) && F.inside(h, x, y) && !F.inside(h, fx, fy)) return { dmg: h.dmg * 0.7, realm: h.realm, color: EL_COL[h.el], src: h.src, mine: false, x: h.x, y: h.y };
      return null;
    }
    for (const h of F.hz) if (hzOn(h) && !h.src?.ally && F.inside(h, x, y) && !F.inside(h, fx, fy)) return { dmg: h.dmg * 0.8, realm: h.realm, color: EL_COL[h.el], src: h.src, mine: false, x: h.x, y: h.y };
    for (const z of g.zhenfa.list) if (!z.dead && z.owner === 'e' && g.zhenfa.inside(z, x, y) && !g.zhenfa.inside(z, fx, fy)) return { dmg: (z.atk ?? z.src?.atk ?? 60) * 1.0, realm: z.src?.realm ?? g.hero.realm, color: '255,150,120', src: z.src, mine: false, x: z.x, y: z.y };
    return null;
  }
  /** NPC 被阵地拦下：冲刺中断、吃伤害、短硬直 */
  private blocked(e: Enemy, b: Body, ai: BrawlAI, bar: Barrier) {
    const B = this.B, c = this.c;
    if (bar.mine) c.hitEnemy(e, bar.dmg, { realm: bar.realm, stCh: 0, school: bar.school as never }, bar.x, bar.y);
    else c.npcHit(bar.src, e, bar.dmg, bar.realm, undefined, bar.x, bar.y);
    b.staggerT = Math.max(b.staggerT, 0.6); b.trail.length = 0;
    this.finish(e, ai, 1.5);
    B.blockFx(e.x, e.y, e.z, bar.color);
  }

  /**
   * 法修 / 剑修的应对：被体修盯上（主角在架势里或正扑过来；或者一个会近战的 NPC 扑向它），
   * 后撤一段，在来路上放一片留在地上的范围技（体修再扑就撞上被拦下）。
   */
  kite(dt: number) {
    this.kiteT -= dt; if (this.kiteT > 0) return; this.kiteT = 0.25;
    const B = this.B, c = this.c, g = this.g, p = g.player;
    if (!(B.stance || B.rushingAt(null)) || g.hero.dead) return;
    for (const e of c.enemies) {
      if (!e.tgP) continue;
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d < 180 || d > 760) continue;
      this.kiteFrom(e, p.x, p.y);
    }
  }
  /** e 被从 (hx, hy) 扑过来的体修盯上了 */
  kiteFrom(e: Enemy, hx: number, hy: number) {
    const c = this.c, g = this.g;
    if (e.dead || e.def.kind !== 'human' || e.ally || !e.aggro || e.cast || e.realm < 2 || (e.hideT ?? 0) > 0 || (e as { shell?: boolean }).shell || isBoss(e)) return;
    if (this.isBrawler(e) || this.B.isAir(e)) return;
    if (!kitOf(e).length) return;   // 布阵也是施法：没有半点法术底子的人（空手木桩、被卸了招的）布不出范围技
    if ((this.kcd.get(e) ?? -99) > g.time) return;
    this.kcd.set(e, g.time + 5 + brnd() * 3);
    e.retreatT = Math.max(e.retreatT, 1.1);
    const mx = e.x + (hx - e.x) * 0.42, my = e.y + (hy - e.y) * 0.42;
    const sc = e.school ? SCHOOLS[e.school] : undefined;
    const el: El = sc?.el && sc.el !== 'phys' ? sc.el : 'fire';
    const h = c.foe.zone(e, mx, my, 150, el, 0.7, 0.3);
    h.pool = 3.5;
    c.texts.push({ x: e.x, y: e.y - 130, s: el === 'sword' ? '剑阵阻敌' : '布阵阻敌', color: '#bfe0ff', t: 0, vy: -22 } as never);
  }
}
