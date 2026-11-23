// v0.53：阵法禁制
// 阵法与禁制本是一物：有人主持的叫阵法，前人留下、无人主持的叫禁制。
//   · 布阵：手持阵盘，按阵插旗、以灵石为阵眼。困阵锁敌、迷踪乱敌、颠倒五行破敌护体；庚金 / 五雷 / 地火三座杀阵；
//     玄武护阵挡飞矢、两仪微尘阵反震；聚灵阵助修炼、回春阵疗伤、敛息阵藏形。阵盘品阶定威力与可同时主持的阵数
//   · 阵眼：每座阵都有一处阵眼（嵌灵石的石座）。困在阵里的修士会去轰阵眼，阵眼一碎阵即破、阵旗折损一半
//   · 阵道：布阵、破阵、破禁、研读阵图都长阵道修为；阵道越高，阵越强、阵越大、越看得穿禁制
//   · 敌阵：魔道阵修与你交手时会就地布下困阵 / 地火阵把你罩住——找到阵眼走过去破开（阵道小成以上、元婴出窍、明清灵目看得见阵眼）
//   · 破禁之局：遗府、古修遗骸的禁制可以按五行相生（木→火→土→金→水）逐一点破阵眼（ui/Pojin.tsx）
//   · 洞府禁制：洞府可叠布数重阵法（防贼、聚灵、隐匿、护府），与旧版「布置禁制」并存
import { pressKey, keyNote } from '../core/keymap';   // 第五轮：说明里的键位从 keymap 取，触屏换说法
import { inCylinder } from './alt';   // P6：阵法命中的高度
import type { Game } from './game';
import type { Enemy } from './combat';
import type { Drawable } from './life';
import type { FxSys, RGB } from '../gl/fx';
import type { DNode, DOpt } from './modal';
import { ZHEN, ZHEN_BY_ID, ZhenDef, ZD_NAME, zdLevel, PANS, PanDef, WX, Wx, wxNext, ZM_NAME, ZM_EVO, zmLevel, zmBonus } from '../data/zhenfa';
import { ACTIVE_MAP } from '../data/world';
import { REALMS } from '../data/realms';
import * as C from './cultivation';
import { v53, meta53, warm53 } from '../gfx/v053Tex';
import { audio } from './audio';

type G = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
const SQ = 0.46;   // 贴地圆压扁比
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const rgb = (s: string): RGB => { const p = s.split(',').map(Number); return [p[0] / 255, p[1] / 255, p[2] / 255]; };
/** 敌阵里困得住人的阵（杀阵冲得出去） */
const CONTAIN = new Set(['kun', 'dihuo']);
const FLAG_OF: Record<string, string[]> = {
  kun: ['jin', 'mu', 'shui', 'tu'], juling: ['mu', 'shui', 'mu', 'shui'], xuanwu: ['shui', 'tu', 'shui', 'tu'], mizong: ['shui', 'mu', 'shui', 'mu', 'shui', 'mu'],
  huichun: ['mu', 'mu', 'shui', 'mu', 'mu', 'shui'], wuxing: ['jin', 'mu', 'shui', 'huo', 'tu'], gengjin: ['jin', 'jin', 'jin', 'jin', 'jin', 'jin', 'jin', 'jin'],
  lianxi: ['shui', 'shui', 'shui', 'shui'], wulei: ['jin', 'mu', 'shui', 'huo', 'tu'], dihuo: ['huo', 'tu', 'huo', 'tu', 'huo', 'tu'], liangyi: ['jin', 'shui'],
};

export interface ZhenSave { id: string; map: string; x: number; y: number; r: number; left: number; untilDay?: number; pow: number; hi: boolean; flags: number; eye: { x: number; y: number; hp: number; max: number } }
/** owner：p 你主持 · e 敌修布下 · a 同行友人布下（效果同你的阵，不存档、不占你的阵数） */
export interface ZhenInst extends ZhenSave { def: ZhenDef; owner: 'p' | 'e' | 'a'; atk?: number; who?: string; t: number; tick: number; tick2: number; trapped: Set<number>; xpGot: number; hidden: boolean; dead?: boolean; bornAt: number; src?: Enemy; /** 敌阵：你确实被圈在阵里（见 effectFoe） */ heldP?: boolean }
interface Fx1 { k: 'sword' | 'fire' | 'bolt' | 'activate' | 'break' | 'shatter'; x: number; y: number; t: number; dur: number; color: string; r?: number; tgt?: Enemy; dmg?: number; done?: boolean; foe?: Enemy | null; pdmg?: number }

export interface Puzzle {
  title: string; tier: number;
  nodes: { w: Wx | 'trap'; veiled: boolean; broken: boolean; x: number; y: number }[];
  start: number;           // 生门（第一步必须点它）
  next: Wx | null;         // 下一步该点的五行
  step: number; need: number; mistakes: number; maxMistakes: number;
  time: number; left: number;
  done: boolean; ok: boolean; zhui: number;
  onDone: (ok: boolean) => void;
  log: string;
}

export class ZhenfaSys {
  list: ZhenInst[] = [];
  fx: Fx1[] = [];
  focus: ZhenInst | null = null; focusD = 1e9;
  private enemyCd = 40; private restored = false;
  constructor(public game: Game) {}

  // ------------------------------------------------------------ 阵道与器物
  get st() { const h = this.game.hero; const s = (h.zd ??= { xp: 0, known: ['kun', 'juling'] }); if (!Array.isArray(s.known)) s.known = ['kun', 'juling']; return s; }
  get lv() { return zdLevel(this.st.xp); }
  knows(id: string) { return this.st.known.includes(id); }
  pan(): PanDef | null { const h = this.game.hero; let best: PanDef | null = null; for (const p of PANS) if (C.bagCount(h, p.id) > 0 && (!best || p.tier > best.tier)) best = p; return best; }
  maxActive() { const p = this.pan(); return p ? p.max + (this.lv >= 5 ? 1 : 0) : 0; }
  powerMul(hi = false) { const p = this.pan(); return (p?.power ?? 1) * (1 + this.lv * 0.08) * (hi ? 1.25 : 1); }
  radMul() { return (this.pan()?.rad ?? 1) * (1 + this.lv * 0.04); }
  costOf(z: ZhenDef) { return Math.round(z.cost * (1 - Math.min(0.3, this.lv * 0.05)) * zmBonus(this.mastLv(z.id)).cost); }
  /** v0.54.2：每座阵的精熟 */
  mastXp(id: string) { return (this.st.mast ??= {})[id] ?? 0; }
  mastLv(id: string) { return zmLevel(this.mastXp(id)); }
  gainMast(id: string, n: number) {
    const m = (this.st.mast ??= {}), before = zmLevel(m[id] ?? 0);
    m[id] = (m[id] ?? 0) + n;
    const after = zmLevel(m[id]);
    if (after > before) { const z = ZHEN_BY_ID[id]; this.game.toast(`${z?.name ?? '阵法'}精熟——「${ZM_NAME[after]}」：${ZM_EVO[after]}。`, 'good'); audio.sfx('chime'); }
  }
  /** 布此阵要几面阵旗（圆满省一面） */
  flagsOf(z: ZhenDef) { return Math.max(2, z.flags - (this.mastLv(z.id) >= 3 ? 1 : 0)); }
  gainXp(n: number, why?: string) {
    const s = this.st, before = this.lv; s.xp += n;
    const after = this.lv;
    if (after > before) { this.game.toast(`阵道精进——「${ZD_NAME[after]}」！${why ?? ''}阵法威力、范围随之增长${after >= 2 && before < 2 ? '；从此看得穿禁制里的杀阵节点与敌阵阵眼' : ''}${after >= 4 && before < 4 ? '；破禁时能看穿两处隐匿阵眼' : ''}。`, 'good'); audio.sfx('chime'); }
  }
  /** 能否看穿阵眼：阵道小成、元婴出窍、明清灵目 */
  get seeEyes() { const g = this.game; return this.lv >= 2 || !!g.yuanying?.active || g.hero.arts.some((a) => a.id === 'mingqing'); }
  /** 研读阵图 */
  learnScroll(itemId: string, zid: string): boolean {
    const g = this.game, h = g.hero, z = ZHEN_BY_ID[zid];
    if (!z) return false;
    if (this.knows(zid)) { g.toast(`你早已通晓《${z.name}》。`, 'warn'); return false; }
    if (h.realm < z.realm) { g.toast(`《${z.name}》需${REALMS[z.realm].name}期方能参透。`, 'warn'); return false; }
    C.removeItem(h, itemId, 1);
    this.st.known.push(zid);
    this.gainXp(10);
    g.toast(`研读阵图，参透《${z.name}》！${this.lv < z.zd ? `（布此阵还需阵道「${ZD_NAME[z.zd]}」）` : `（${pressKey('zhenfa', '在「≡ 菜单 → 阵法」里')}打开阵法盘布阵）`}`, 'good');
    audio.sfx('chime'); g.updateUI(true);
    return true;
  }
  /** 遗府 / 遗骸里的阵图：优先给还没参透、境界够得着的；遗府独有的阵图更常见 */
  ruinScroll(): string | null {
    const h = this.game.hero;
    const pool = ZHEN.filter((z) => z.src !== 'start' && !this.knows(z.id) && z.realm <= h.realm + 1 && C.bagCount(h, 'zt_' + z.id) === 0);
    if (!pool.length) return null;
    const w = pool.map((z) => (z.src === 'ruin' ? 2.5 : 1));
    let r = Math.random() * w.reduce((a, b) => a + b, 0);
    for (let k = 0; k < pool.length; k++) { r -= w[k]; if (r <= 0) return 'zt_' + pool[k].id; }
    return 'zt_' + pool[0].id;
  }
  /** 新开局与老存档：宗门传功阁配发一套入门阵具（只发一次） */
  private gift() {
    const g = this.game, h = g.hero;
    if (g.ws.flags.zfGift || h.dead) return;
    g.ws.flags.zfGift = 1;
    if (!this.pan()) C.addItem(h, 'zf_pan1', 1);
    C.addItem(h, 'zf_qi', 12);
    g.hint('zhenfa', `传功阁配发了一面木阵盘与十二面阵旗：${pressKey('zhenfa', '在「≡ 菜单 → 阵法」里')}打开阵法盘，即可就地布下困阵、聚灵阵。阵法禁制详见修仙指南。`);
  }

  // ------------------------------------------------------------ 布阵 / 收阵
  /** 不能布返回原因 */
  why(z: ZhenDef): string | null {
    const g = this.game, h = g.hero;
    if (!this.knows(z.id)) return '尚未参透此阵阵图';
    if (h.realm < z.realm) return `需${REALMS[z.realm].name}期`;
    if (this.lv < z.zd) return `需阵道「${ZD_NAME[z.zd]}」`;
    if (!this.pan()) return '没有阵盘（坊市有售木阵盘）';
    const mine = this.list.filter((i) => i.owner === 'p' && i.map === ACTIVE_MAP && !i.dead);
    if (mine.length >= this.maxActive()) return `阵盘只能同时主持 ${this.maxActive()} 座阵（先收一座）`;
    if (C.bagCount(h, 'zf_qi') + C.bagCount(h, 'zf_qi2') < this.flagsOf(z)) return `阵旗不足（需 ${this.flagsOf(z)} 面）`;
    if (C.bagCount(h, 'mat_lingshi') < this.costOf(z)) return `灵石不足（需 ${this.costOf(z)}）`;
    if (g.inCave) return '洞府里请用「洞府禁制」';
    if (g.isFlying && !g.yuanying?.active) return '御剑在空，插不下阵旗（先落地）';
    return null;
  }
  deploy(id: string): boolean {
    const g = this.game, h = g.hero, z = ZHEN_BY_ID[id];
    if (!z) return false;
    const w = this.why(z); if (w) { g.toast(`布不成${z.name}：${w}。`, 'warn'); return false; }
    const p = g.yuanying?.active && g.yuanying.body ? g.yuanying.body : g.player;
    const nf = this.flagsOf(z), hi = C.bagCount(h, 'zf_qi2') >= nf, mb = zmBonus(this.mastLv(id));
    C.removeItem(h, hi ? 'zf_qi2' : 'zf_qi', nf);
    C.removeItem(h, 'mat_lingshi', this.costOf(z));
    const r = z.r * this.radMul() * mb.rad;
    const pow = this.powerMul(hi) * mb.pow;
    const ea = Math.random() * TAU, ed = r * (0.45 + Math.random() * 0.3);
    const eyeMax = (40 + z.cost * 0.08) * pow * (hi ? 1.3 : 1) * mb.eye;
    const inst = this.make({ id, map: ACTIVE_MAP, x: p.x, y: p.y, r, left: z.dur * mb.dur, untilDay: z.days ? g.day + Math.round(z.days * mb.dur) : undefined, pow, hi, flags: nf, eye: { x: p.x + Math.cos(ea) * ed, y: p.y + Math.sin(ea) * ed * SQ, hp: eyeMax, max: eyeMax } }, 'p');
    for (const e of g.combat.enemies) if (!e.dead && this.inside(inst, e.x, e.y)) inst.trapped.add(e.id);
    this.list.push(inst);
    this.fx.push({ k: 'activate', x: inst.x, y: inst.y, t: 0, dur: 0.9, color: z.color, r });
    g.combat.impact(inst.x, inst.y, 2, z.color);
    g.combat.castT = 0.4; g.combat.castSeq++;
    warm53([z.img, 'zf_activate', 'zf_break', 'zf_eye_stone', ...new Set((FLAG_OF[id] ?? []).map((f) => 'zf_flag_' + f))]);
    this.gainXp(2); this.gainMast(id, 2);
    audio.sfx('bell');
    g.toast(`${hi ? '上品阵旗' : '阵旗'}${nf}面落地，灵石为眼——${z.name}已成！${z.days ? `（可维持 ${Math.round(z.days * mb.dur)} 日）` : `（约 ${Math.round(z.dur * mb.dur)} 息）`}`, 'good');
    g.renderer?.resetStill();
    return true;
  }
  private make(s: ZhenSave, owner: 'p' | 'e' | 'a'): ZhenInst {
    const inst: ZhenInst = { ...s, def: ZHEN_BY_ID[s.id], owner, t: 0, tick: 0, tick2: 0, trapped: new Set(), xpGot: 0, hidden: owner === 'e', bornAt: this.game.time };
    // 敌阵是照着你脚下布的：布成那一刻你在阵里，就算被圈住了（不必等到下一帧）
    if (owner === 'e') { const p = this.game.player; inst.heldP = this.inside(inst, p.x, p.y); }
    return inst;
  }
  /** 贴地椭圆内（纵向半径 = r·SQ） */
  inside(i: ZhenInst, x: number, y: number, pad = 0) { return Math.hypot(x - i.x, (y - i.y) / SQ) < i.r + pad; }
  /** 把一点按到椭圆半径 R 之内 / 之外 */
  private keep(i: ZhenInst, o: { x: number; y: number }, R: number, out: boolean) {
    const dx = o.x - i.x, dy = (o.y - i.y) / SQ, d = Math.hypot(dx, dy) || 1e-3;
    if (out ? d >= R : d <= R) return false;
    o.x = i.x + dx / d * R; o.y = i.y + dy / d * R * SQ; return true;
  }
  /** 收阵：阵眼完好则阵旗尽数收回 */
  dismiss(i: ZhenInst, silent = false) {
    if (i.dead) return;
    i.dead = true;
    if (i.owner === 'p') { C.addItem(this.game.hero, i.hi ? 'zf_qi2' : 'zf_qi', i.flags); if (!silent) this.game.toast(`收起${i.def.name}，${i.flags}面阵旗入袋。`, 'info'); }
    this.fx.push({ k: 'activate', x: i.x, y: i.y, t: 0, dur: 0.5, color: i.def.color, r: i.r * 0.6 });
    audio.sfx('whoosh');
  }
  /** 破阵：阵眼被毁 */
  shatter(i: ZhenInst, by: 'foe' | 'player') {
    if (i.dead) return;
    i.dead = true;
    const g = this.game;
    this.fx.push({ k: 'break', x: i.x, y: i.y, t: 0, dur: 0.8, color: i.def.color, r: i.r });
    if (i.def.id === 'xuanwu' || i.def.id === 'liangyi') this.fx.push({ k: 'shatter', x: i.x, y: i.y, t: 0, dur: 0.7, color: i.def.color, r: i.r });
    g.combat.impact(i.eye.x, i.eye.y, 3, i.def.color);
    audio.sfx('break');
    if (i.owner === 'p') {
      const back = Math.floor(i.flags / 2);
      if (back > 0) C.addItem(g.hero, i.hi ? 'zf_qi2' : 'zf_qi', back);
      g.toast(`${i.def.name}的阵眼被轰碎，阵破了！（收回 ${back} 面阵旗）`, 'warn');
    } else if (i.owner === 'a') {
      g.toast(`${i.who ?? '友人'}布下的${i.def.name}被轰破了。`, 'warn');
    } else {
      g.toast(`阵眼应声而碎——${i.def.name}破了！`, 'good');
      this.gainXp(6, '破敌阵眼，');
    }
    g.renderer?.resetStill();
  }

  // ------------------------------------------------------------ 战斗钩子
  private mine(x: number, y: number, id: string) { for (const i of this.list) if (!i.dead && i.owner !== 'e' && i.def.id === id && i.map === ACTIVE_MAP && this.inside(i, x, y)) return i; return null; }
  /** 你在阵中所受伤害的系数（玄武护阵 / 两仪微尘阵） */
  takeMul(x: number, y: number) { let k = 1; if (this.mine(x, y, 'xuanwu')) k *= 0.6; if (this.mine(x, y, 'liangyi')) k *= 0.8; return k; }
  /** 两仪反震 */
  reflect(x: number, y: number, d: number, from?: Enemy) {
    const i = this.mine(x, y, 'liangyi'); if (!i || !from || from.dead) return;
    const g = this.game;
    g.combat.hitEnemy(from, d * 0.3 * i.pow, { realm: g.hero.realm, stCh: 0, school: '阵' }, x, y);
    g.combat.vfx.push({ kind: 'beam', anchor: { x, y, offsetY: -g.player.st.lift }, endAnchor: { x: from.x, y: from.y, offsetY: -from.flyH - from.lift }, x, y: y - 50, x2: from.x, y2: from.y - 40, r: 6, t: 0, dur: 0.25, color: i.def.color, seed: Math.random() * 1e6 } as any);
  }
  /** 颠倒五行：阵中之敌易伤 */
  vuln(e: Enemy) { for (const i of this.list) if (!i.dead && i.owner !== 'e' && i.def.id === 'wuxing' && this.inside(i, e.x, e.y)) return 1.35 + (i.pow - 1) * 0.3; return 1; }
  /** 聚灵阵：打坐修炼倍率 */
  placeMul(x: number, y: number): number { const i = this.mine(x, y, 'juling'); return i ? 1.3 + 0.25 * i.pow : 1; }

  // ------------------------------------------------------------ 每帧
  update(dt: number) {
    const g = this.game, c = g.combat, h = g.hero, p = g.player;
    if (!this.restored) { this.restored = true; this.restore(); }
    this.gift();
    for (const f of this.fx) {
      f.t += dt;
      if (f.done || f.t < f.dur * 0.55) continue;
      if (f.tgt !== undefined) { f.done = true; if (f.tgt && !f.tgt.dead && f.dmg) this.strike(f); }
      else if (f.pdmg !== undefined) { f.done = true; if (Math.hypot(p.x - f.x, (p.y - f.y) * 1.6) < (f.k === 'bolt' ? 90 : 70) && p.z <= 120) c.hitPlayer(f.pdmg, f.foe?.realm ?? h.realm, f.k === 'bolt' ? { k: 'shock', dur: 0.8, ch: 0.5 } : f.k === 'sword' ? { k: 'break', dur: 3, ch: 0.4 } : { k: 'burn', dur: 2, ch: 0.5 }, f.x, f.y, f.foe ?? undefined); }
    }
    this.fx = this.fx.filter((f) => f.t < f.dur);
    const atk = c.pStats.atk;
    // 焦点（收阵 / 破阵眼）
    this.focus = null; this.focusD = 1e9;
    for (const i of this.list) {
      if (i.dead || i.map !== ACTIVE_MAP) continue;
      i.t += dt;
      if (i.untilDay !== undefined) { if (g.day >= i.untilDay) { this.dismiss(i, true); g.toast(`${i.def.name}灵石耗尽，阵法自行散去，阵旗收回。`, 'info'); continue; } }
      else { i.left -= dt; if (i.left <= 0) { this.dismiss(i, true); if (i.owner === 'p') g.toast(`${i.def.name}灵石耗尽，阵法散去，阵旗收回。`, 'info'); continue; } }
      const ed = Math.hypot(i.eye.x - p.x, i.eye.y - p.y);
      const canSee = i.owner === 'p' || (i.owner === 'e' && (this.seeEyes || ed < 140));
      if (canSee && ed < 130 && ed < this.focusD) { this.focus = i; this.focusD = ed; }
      i.tick -= dt; i.tick2 -= dt;
      this.effect(i, dt, atk);
    }
    // 存进世界状态（只存你主持的、还在的）
    g.ws.zf = this.list.filter((i) => i.owner === 'p' && !i.dead).map((i): ZhenSave => ({ id: i.id, map: i.map, x: i.x, y: i.y, r: i.r, left: i.left, untilDay: i.untilDay, pow: i.pow, hi: i.hi, flags: i.flags, eye: { ...i.eye } })).concat(this.offMap);
    this.list = this.list.filter((i) => !i.dead);
    void h;
    this.enemyTick(dt);
  }
  /** 阵里的敌人。P6：阵法是贴地的圆柱（ALT.groundAoe 高），飞得比它高的从阵顶上过去 */
  private foesIn(i: ZhenInst) { return this.game.combat.enemies.filter((e) => !e.dead && !(e.hideT > 0) && this.inside(i, e.x, e.y) && inCylinder(e.z)); }
  private effect(i: ZhenInst, dt: number, atk: number) {
    const g = this.game, c = g.combat, p = g.player, h = g.hero, id = i.def.id;
    const src = { realm: h.realm, stCh: 0, school: '阵' as const };
    if (i.owner === 'e') return this.effectFoe(i, dt);
    if (i.owner === 'a') atk = i.atk ?? atk;   // 友人布的阵按友人的修为出力
    const foes = this.foesIn(i);
    // 困在阵里的修士会去轰阵眼
    for (const e of foes) {
      if (!e.aggro || e.ally) continue;
      const smart = e.def.kind === 'human' || (e.realm >= 3);
      if (!smart || (id !== 'kun' && id !== 'mizong' && id !== 'wuxing' && id !== 'xuanwu' && id !== 'liangyi')) continue;
      const dps = 0.6 * Math.pow(1.9, Math.max(0, e.realm - h.realm)) * (e.boss ? 2 : 1);
      i.eye.hp -= dps * dt * (i.hi ? 0.75 : 1);
      if (Math.random() < dt * 1.5) c.sparks.push({ x: i.eye.x + (Math.random() - 0.5) * 30, y: i.eye.y - 40, vx: (Math.random() - 0.5) * 120, vy: -80 - Math.random() * 80, t: 0, max: 0.4, size: 4, color: i.def.color } as any);
    }
    if (i.eye.hp <= 0) { this.shatter(i, 'foe'); return; }
    // 阵中有敌：长阵道（每座阵最多 8 点）
    if (i.owner === 'p' && foes.length && i.xpGot < 8 && Math.random() < dt * 0.25) { i.xpGot++; this.gainXp(1); this.gainMast(id, 1); }
    switch (id) {
      case 'kun': {
        for (const e of c.enemies) if (!e.dead && this.inside(i, e.x, e.y) && inCylinder(e.z)) i.trapped.add(e.id);   // P6：困阵也只困得住圆柱里的
        for (const e of c.enemies) {
          if (e.dead || !i.trapped.has(e.id)) continue;
          if (this.keep(i, e, i.r * 0.94, false)) { e.kx = 0; e.ky = 0; if (Math.random() < dt * 3) c.sparks.push({ x: e.x, y: e.y - 30, vx: 0, vy: -60, t: 0, max: 0.4, size: 5, color: i.def.color } as any); }
        }
        if (i.tick <= 0) { i.tick = 3 / Math.min(1.6, i.pow); for (const e of foes) c.applyStatus(e.st, { k: 'root', dur: 1.2, ch: 1 }, 0, e, i.x, i.y); if (foes.length) c.vfx.push({ kind: 'ring', x: i.x, y: i.y, r: i.r, t: 0, dur: 0.5, color: i.def.color } as any); }
        break;
      }
      case 'mizong': {
        if (i.tick <= 0) {
          i.tick = 2;
          for (const e of foes) {
            c.applyStatus(e.st, { k: 'slow', dur: 2.2, ch: 1 }, 0, e, i.x, i.y);
            if (Math.random() < 0.55 && !e.boss) { e.aggro = false; e.tankRef = undefined; e.wanderT = 0; c.texts.push({ x: e.x, y: e.y - 110, s: '迷失', color: '#d0d8e0', t: 0, vy: -30 } as any); }
          }
        }
        break;
      }
      case 'wuxing': {
        if (i.tick <= 0) { i.tick = 2.5; for (const e of foes) if (Math.random() < 0.35) c.applyStatus(e.st, { k: 'stun', dur: 0.8, ch: 1 }, 0, e, i.x, i.y); }
        break;
      }
      case 'gengjin': {
        if (i.tick <= 0 && foes.length) {
          i.tick = 0.7 / Math.min(1.5, i.pow);
          const e = foes[Math.floor(Math.random() * foes.length)];
          this.fx.push({ k: 'sword', x: e.x + (Math.random() - 0.5) * 20, y: e.y, t: 0, dur: 0.5, color: i.def.color, tgt: e, dmg: atk * 0.9 * i.pow });
        }
        break;
      }
      case 'wulei': {
        if (i.tick <= 0 && foes.length) {
          i.tick = 1.2;
          for (let k = 0; k < Math.min(2, foes.length); k++) { const e = foes[Math.floor(Math.random() * foes.length)]; this.fx.push({ k: 'bolt', x: e.x, y: e.y, t: 0, dur: 0.45, color: i.def.color, tgt: e, dmg: atk * 1.3 * i.pow * (e.def.evil ? 2 : 1) }); }
          audio.sfx('thunder');
        }
        break;
      }
      case 'dihuo': {
        if (i.tick <= 0 && foes.length) {
          i.tick = 1 / Math.min(1.4, i.pow);
          const e = foes[Math.floor(Math.random() * foes.length)];
          this.fx.push({ k: 'fire', x: e.x, y: e.y, t: 0, dur: 0.7, color: i.def.color, tgt: e, dmg: atk * 1.1 * i.pow });
        }
        break;
      }
      case 'xuanwu': {
        // 飞矢挡在罩外
        for (const pr of c.projs) {
          if (pr.fac !== 'e' || pr.ally || pr.life >= pr.max) continue;
          if (this.inside(i, pr.x, pr.y + 40) && !(pr.src && this.inside(i, pr.src.x, pr.src.y))) {
            pr.life = pr.max;
            i.eye.hp -= Math.max(1, pr.dmg / Math.max(1, c.pStats.hp) * 120) * (i.hi ? 0.7 : 1);
            c.fxq.push({ k: 'block', x: pr.x, y: pr.y, color: i.def.color } as any);
          }
        }
        // 罩外之敌闯不进来
        for (const e of c.enemies) {
          if (e.dead || e.ally || i.trapped.has(e.id)) continue;
          if (this.keep(i, e, i.r + 20, true) && e.aggro) i.eye.hp -= dt * 0.8 * Math.pow(1.9, Math.max(0, e.realm - h.realm));
        }
        if (i.eye.hp <= 0) this.shatter(i, 'foe');
        break;
      }
      case 'huichun': {
        if (this.inside(i, p.x, p.y)) h.hp = Math.min(1, h.hp + 0.022 * i.pow * dt);
        for (const a of g.npcs.followers()) if (this.inside(i, a.st.x, a.st.y)) a.hp = Math.min(1, a.hp + 0.03 * dt);
        if (i.tick <= 0) { i.tick = 0.5; if (this.inside(i, p.x, p.y)) c.sparks.push({ x: p.x + (Math.random() - 0.5) * 50, y: p.y - 20, vx: 0, vy: -70, t: 0, max: 0.9, size: 4, color: '150,240,150' } as any); }
        break;
      }
      case 'lianxi': {
        if (this.inside(i, p.x, p.y)) {
          c.buffs.until.stealth = Math.max(c.buffs.until.stealth ?? 0, g.time + 0.6);
          if (i.tick <= 0) { i.tick = 0.5; for (const e of c.enemies) if (!e.dead && e.aggro && !e.boss && Math.hypot(e.x - p.x, e.y - p.y) > 150 / Math.min(1.5, i.pow)) { e.aggro = false; e.tankRef = undefined; } }
        }
        break;
      }
      case 'juling': {
        if (this.inside(i, p.x, p.y)) h.mp = Math.min(1, h.mp + 0.004 * i.pow * dt);
        break;
      }
    }
    void src;
  }
  private strike(f: Fx1) {
    const g = this.game, c = g.combat, e = f.tgt!;
    const st = f.k === 'bolt' ? { k: 'shock' as const, dur: 1, ch: 0.6 } : f.k === 'fire' ? { k: 'burn' as const, dur: 3, ch: 0.7 } : undefined;
    c.hitEnemy(e, f.dmg!, { realm: g.hero.realm, status: st, stCh: st?.ch ?? 0, school: f.k === 'bolt' ? '雷' : f.k === 'fire' ? '火' : '剑' }, e.x, e.y - 200);
    c.impact(e.x, e.y, 1, f.color);
    if (f.k === 'sword') audio.sfx('sword');
  }

  // ------------------------------------------------------------ 敌阵
  private enemyTick(dt: number) {
    const g = this.game, c = g.combat, p = g.player, h = g.hero;
    this.enemyCd -= dt;
    if (this.enemyCd > 0 || g.halted || g.inCave || h.dead) return;
    if (this.list.some((i) => i.owner === 'e' && !i.dead)) return;
    if (!c.inCombat) return;
    this.enemyCd = 8;
    const caster = c.enemies.find((e) => !e.dead && e.aggro && !e.ally && !e.spar && e.def.kind === 'human' && e.realm >= 2 && Math.hypot(e.x - p.x, e.y - p.y) < 700);
    if (!caster || Math.random() > 0.16) return;
    this.enemyCd = 70;
    // v0.54.2：敌修会的阵多了——筑基：困阵、迷踪阵、庚金剑阵；结丹以上再添地火阵、五雷阵
    const pool = caster.realm >= 3 ? ['kun', 'mizong', 'gengjin', 'dihuo', 'wulei'] : ['kun', 'kun', 'mizong', 'gengjin'];
    const id = pool[Math.floor(Math.random() * pool.length)], z = ZHEN_BY_ID[id];
    const r = z.r * (0.9 + caster.realm * 0.08);
    const ea = Math.random() * TAU, ed = r * (0.55 + Math.random() * 0.3);
    const eyeMax = 1;
    const inst = this.make({ id, map: ACTIVE_MAP, x: p.x, y: p.y, r, left: 26, pow: 1 + (caster.realm - h.realm) * 0.3, hi: false, flags: z.flags, eye: { x: p.x + Math.cos(ea) * ed, y: p.y + Math.sin(ea) * ed * SQ, hp: eyeMax, max: eyeMax } }, 'e');
    inst.src = caster;
    this.list.push(inst);
    this.fx.push({ k: 'activate', x: p.x, y: p.y, t: 0, dur: 0.9, color: '200,70,80', r });
    audio.sfx('bell');
    const how = id === 'kun' ? '你被困在了' : id === 'mizong' ? '浓雾四合，你陷进了' : '杀机骤起，你站在了';
    g.toast(`${caster.name ?? caster.def.name}掐诀一指，${z.flags}面阵旗冲天而起——${how}「${z.name}」里！${CONTAIN.has(id) ? '' : '（杀阵困不住人：冲出阵界，或破开阵眼）'}${this.seeEyes ? `阵眼就在不远处，走过去破开它${keyNote('interact', '点「谈」')}！` : '阵眼藏在阵中某处：靠近时会有灵光一闪（阵道小成 / 元婴出窍 / 明清灵目可直接看穿）。'}`, 'warn');
    warm53([z.img, 'zf_eye_stone_ancient', 'zf_flag_mo', 'zf_break']);
  }
  private effectFoe(i: ZhenInst, dt: number) {
    const g = this.game, c = g.combat, p = g.player;
    if (i.src && i.src.dead && i.t > 3) { this.shatter(i, 'player'); return; }   // 主阵之人一死，阵自溃
    const id = i.def.id, atk = i.src?.atk ?? 50, inside = this.inside(i, p.x, p.y);
    // 困阵 / 地火阵：你走不出去（元婴出窍时元婴照样被困）；迷踪阵：走到阵界又被雾气兜回阵中某处
    // 只困得住本来就在阵里的人：人在阵外不会被吸进去；用传送阵、回府符、虚空挪移一下子远遁出去的（离阵界两千五以外）
    // 也不会隔着半张图被拽回阵里——原来不管离多远，下一帧都被按回阵界上
    if (inside) i.heldP = true; else if (Math.hypot(p.x - i.x, (p.y - i.y) / SQ) > i.r + 2500) i.heldP = false;
    if (!i.heldP) { /* 不在阵里，也没被圈住 */ }
    else if (id === 'mizong') {
      if (!this.inside(i, p.x, p.y, -i.r * 0.06)) {
        const a = Math.random() * TAU, d = i.r * (0.2 + Math.random() * 0.45);
        c.addGhosts(p.x, p.y, i.x + Math.cos(a) * d, i.y + Math.sin(a) * d * SQ, 4, i.def.color, 0.4);
        p.x = i.x + Math.cos(a) * d; p.y = i.y + Math.sin(a) * d * SQ; p.st.x = p.x; p.st.y = p.y;
        if (Math.random() < 0.5) g.toast('雾里辨不清方向，走着走着又绕回了阵中——先破阵眼！', 'warn');
      }
      if (i.tick <= 0) { i.tick = 2.4; c.applyStatus(c.pst, { k: 'slow', dur: 2, ch: 1 }, 0, null, i.x, i.y); if (c.lock && Math.random() < 0.5) { c.lock = null; c.texts.push({ x: p.x, y: p.y - 130, s: '迷失', color: '#d0d8e0', t: 0, vy: -30 } as any); } }
    } else if (CONTAIN.has(id)) { if (this.keep(i, p, i.r * 0.95, false) && Math.random() < dt * 2) g.toast('阵界如墙，冲不出去——先破阵眼！', 'warn'); }
    if (!inside) return;
    if (id === 'kun' && i.tick <= 0) { i.tick = 4; c.applyStatus(c.pst, { k: 'root', dur: 0.9, ch: 1 }, 0, null, i.x, i.y); c.vfx.push({ kind: 'ring', x: i.x, y: i.y, r: i.r, t: 0, dur: 0.5, color: i.def.color } as any); }
    // 杀阵：落点就在你脚下，0.4 息后才落实——人还在原地就挨打
    const at = (k: Fx1['k'], dur: number, mul: number) => this.fx.push({ k, x: p.x + (Math.random() - 0.5) * 40, y: p.y + (Math.random() - 0.5) * 20, t: 0, dur, color: i.def.color, foe: i.src ?? null, pdmg: atk * mul * i.pow, done: false } as Fx1);
    if (id === 'dihuo' && i.tick <= 0) { i.tick = 1.6; at('fire', 0.9, 0.9); }
    if (id === 'gengjin' && i.tick <= 0) { i.tick = 1.1; at('sword', 0.75, 0.7); audio.sfx('sword'); }
    if (id === 'wulei' && i.tick <= 0) { i.tick = 1.8; at('bolt', 0.8, 1.1); if (Math.random() < 0.5) audio.sfx('thunder'); }
  }
  /** v0.54.2：同行友人布阵（不耗你的阵旗灵石，不占你的阵数，也不存档） */
  allyDeploy(id: string, x: number, y: number, realm: number, atk: number, who: string): boolean {
    const g = this.game, z = ZHEN_BY_ID[id]; if (!z || g.inCave) return false;
    if (this.list.some((i) => i.owner === 'a' && !i.dead && i.who === who)) return false;
    const r = z.r * (0.95 + realm * 0.05), pow = 1 + Math.max(0, realm - 1) * 0.15;
    const ea = Math.random() * TAU, ed = r * (0.45 + Math.random() * 0.3), eyeMax = (40 + z.cost * 0.08) * pow;
    const inst = this.make({ id, map: ACTIVE_MAP, x, y, r, left: z.dur * 0.8, pow, hi: false, flags: z.flags, eye: { x: x + Math.cos(ea) * ed, y: y + Math.sin(ea) * ed * SQ, hp: eyeMax, max: eyeMax } }, 'a');
    inst.atk = atk; inst.who = who;
    for (const e of g.combat.enemies) if (!e.dead && this.inside(inst, e.x, e.y)) inst.trapped.add(e.id);
    this.list.push(inst);
    this.fx.push({ k: 'activate', x, y, t: 0, dur: 0.9, color: z.color, r });
    g.combat.impact(x, y, 2, z.color);
    warm53([z.img, 'zf_activate', 'zf_break', 'zf_eye_stone', ...new Set((FLAG_OF[id] ?? []).map((f) => 'zf_flag_' + f))]);
    audio.sfx('bell');
    g.toast(`${who}掐诀抛出${z.flags}面阵旗——「${z.name}」成了！`, 'good');
    return true;
  }
  /** T：收阵 / 破敌阵眼 */
  interact(): boolean {
    const i = this.focus; if (!i) return false;
    const g = this.game;
    if (i.owner === 'e') {
      const h = g.hero;
      if (h.mp < 0.06) { g.toast('法力不足，冲不开阵眼。', 'warn'); return true; }
      h.mp -= 0.06; i.hidden = false; this.shatter(i, 'player');
      return true;
    }
    g.openDialog(this.instNode(i));
    return true;
  }
  instNode(i: ZhenInst): DNode {
    const g = this.game, h = g.hero, z = i.def;
    const left = i.untilDay !== undefined ? `还能维持 ${Math.max(0, Math.ceil(i.untilDay - g.day))} 日` : `还能维持 ${Math.max(0, Math.round(i.left))} 息`;
    const top = Math.round(z.cost * 0.5);
    return {
      speaker: z.name, title: `${z.cat}阵 · 阵眼 ${Math.round(i.eye.hp / i.eye.max * 100)}% · ${left}`, mood: 'mystic',
      text: `${i.hi ? '上品阵旗' : '阵旗'}${i.flags}面猎猎作响，阵眼灵石光华流转。\n\n${z.desc}`,
      options: [
        { label: `添灵石续阵（${top} 灵石，${i.untilDay !== undefined ? '+15 日' : `+${Math.round(z.dur * 0.6)} 息`}，修复阵眼）`, disabled: C.bagCount(h, 'mat_lingshi') < top, hint: C.bagCount(h, 'mat_lingshi') < top ? '灵石不足' : '', act: () => { C.removeItem(h, 'mat_lingshi', top); if (i.untilDay !== undefined) i.untilDay += 15; else i.left += z.dur * 0.6; i.eye.hp = i.eye.max; return this.instNode(i); } },
        { label: '收阵（阵旗尽数收回）', act: () => { this.dismiss(i); return null; } },
        { label: '离开', act: () => null },
      ],
    };
  }
  /** 读档后把还在本图的阵恢复出来 */
  restore() {
    const arr = this.game.ws.zf ?? [];
    this.list = this.list.filter((i) => i.owner === 'e');
    for (const s of arr) if (ZHEN_BY_ID[s.id] && s.map === ACTIVE_MAP) this.list.push(this.make(s, 'p'));
    // 别的图上的阵保留在存档里（下次回来还在）
    this.offMap = arr.filter((s) => s.map !== ACTIVE_MAP);
  }
  private offMap: ZhenSave[] = [];
  /** 读档 / 新开局 */
  reset() { this.list = []; this.fx = []; this.restored = false; this.enemyCd = 40; this.offMap = []; }

  // ------------------------------------------------------------ 破禁之局
  /** 生成一局：tier 0–4（越高节点越多、杀阵与隐匿节点越多、时间越紧） */
  puzzle(title: string, tier: number, onDone: (ok: boolean) => void): Puzzle {
    const g = this.game;
    const n = Math.min(9, 5 + tier), traps = tier >= 4 ? 2 : tier >= 2 ? 1 : 0, len = n - traps;
    const s0 = WX[Math.floor(Math.random() * 5)];
    const seq: Wx[] = []; let w = s0; for (let k = 0; k < len; k++) { seq.push(w); w = wxNext(w); }
    const items: (Wx | 'trap')[] = [...seq, ...Array(traps).fill('trap')];
    // 打乱位置，但记住生门是 seq[0] 那一个
    const order = items.map((_, k) => k).sort(() => Math.random() - 0.5);
    const nodes = order.map((k, j) => { const an = -Math.PI / 2 + (j / n) * TAU; return { w: items[k], veiled: false, broken: false, x: Math.cos(an), y: Math.sin(an), _k: k } as any; });
    const start = nodes.findIndex((nd: any) => nd._k === 0);
    let veil = Math.min(n - 2, tier + 1);
    if (this.lv >= 4) veil -= 2;
    if (g.hero.arts.some((a) => a.id === 'mingqing')) veil -= 1;
    if (g.yuanying?.active) veil = 0;
    const cand = nodes.map((_: any, k: number) => k).filter((k: number) => k !== start).sort(() => Math.random() - 0.5);
    for (let k = 0; k < Math.max(0, veil); k++) nodes[cand[k]].veiled = true;
    // 杀阵节点：阵道不够看不穿（显示成隐匿）
    if (!this.seeEyes) for (const nd of nodes) if (nd.w === 'trap') nd.veiled = true;
    const time = Math.max(24, 52 - tier * 5) + this.lv * 3;
    return { title, tier, nodes, start, next: seq[0], step: 0, need: len, mistakes: 0, maxMistakes: 3 - (tier >= 4 ? 1 : 0) + (this.lv >= 3 ? 1 : 0), time, left: time, done: false, ok: false, zhui: 0, onDone, log: `从「生门」起，按五行相生（木→火→土→金→水→木）逐一点破阵眼。` };
  }
  openPuzzle(title: string, tier: number, onDone: (ok: boolean) => void) {
    const g = this.game;
    warm53(['ui_board', 'ui_node_jin', 'ui_node_mu', 'ui_node_shui', 'ui_node_huo', 'ui_node_tu', 'ui_node_trap', 'ui_node_broken', 'zf_gujin']);
    g.openModal({ kind: 'pojin', puzzle: this.puzzle(title, tier, onDone) } as any);
  }
  /** 点一个节点 */
  pick(P: Puzzle, k: number, zhui = false): 'ok' | 'wrong' | 'trap' | 'done' | 'nop' {
    const g = this.game, h = g.hero, nd = P.nodes[k];
    if (P.done || !nd || nd.broken) return 'nop';
    if (zhui) {
      if (C.bagCount(h, 'zf_zhui') <= 0) { P.log = '储物袋里没有破禁锥。'; return 'nop'; }
      C.removeItem(h, 'zf_zhui', 1); P.zhui++;
      nd.veiled = false;
      if (nd.w === 'trap') { nd.broken = true; P.log = '破禁锥钉入——竟是一处杀阵节点，被你稳稳拔除！'; return 'ok'; }
    }
    const want = P.step === 0 ? P.start === k : nd.w === P.next;
    if (nd.w === 'trap') {
      nd.veiled = false; nd.broken = true; P.mistakes++;
      h.hp = Math.max(0.05, h.hp - 0.12 - P.tier * 0.03);
      P.log = '杀阵节点！一道杀光反噬而来——气血大损。';
      audio.sfx('fail');
      return this.checkFail(P) ?? 'trap';
    }
    if (!want && !zhui) {
      nd.veiled = false; P.mistakes++;
      h.hp = Math.max(0.05, h.hp - 0.06 - P.tier * 0.015);
      P.log = P.step === 0 ? '那不是生门。禁制一阵翻涌，反震得你气血翻腾。' : `点错了——此处是「${WXN[nd.w as Wx]}」，眼下该破「${WXN[P.next!]}」。禁制反震！`;
      audio.sfx('clang');
      return this.checkFail(P) ?? 'wrong';
    }
    if (zhui && !want) { nd.broken = true; P.log = `破禁锥钉碎了「${WXN[nd.w as Wx]}」位——次序未乱。`; return 'ok'; }
    nd.broken = true; nd.veiled = false;
    P.step++;
    P.next = wxNext(nd.w as Wx);
    audio.sfx('chime');
    // 余下同属的节点都还得破：数清楚还剩几个
    const left = P.nodes.filter((x) => !x.broken && x.w !== 'trap').length;
    if (left === 0) {
      P.done = true; P.ok = true; P.log = '最后一处阵眼溃散——禁制如水波般荡开！';
      this.gainXp(6 + P.tier * 4, '破禁有得，');
      return 'done';
    }
    // 若下一步需要的五行已经没有了（同属节点被破禁锥提前钉碎），顺延到下一个还有的
    for (let s = 0; s < 5 && !P.nodes.some((x) => !x.broken && x.w === P.next); s++) P.next = wxNext(P.next!);
    P.log = `破开「${WXN[nd.w as Wx]}」位。下一处：「${WXN[P.next!]}」。`;
    return 'ok';
  }
  private checkFail(P: Puzzle): 'done' | null {
    if (P.mistakes >= P.maxMistakes) { P.done = true; P.ok = false; P.log += '\n禁制彻底合拢，再也寻不到间隙了。'; return 'done'; }
    return null;
  }
  tickPuzzle(P: Puzzle, dt: number) {
    if (P.done) return;
    P.left -= dt;
    if (P.left <= 0) { P.left = 0; P.done = true; P.ok = false; P.log = '时辰已过，禁制流转复原——这一局破不成了。'; audio.sfx('fail'); }
  }

  // ------------------------------------------------------------ 洞府禁制
  static HOME_OK = ['kun', 'mizong', 'xuanwu', 'wuxing', 'lianxi', 'juling', 'huichun', 'liangyi'];
  homeLayers(): string[] { const hm = this.game.ws.home as any; if (!hm) return []; if (!Array.isArray(hm.zf)) hm.zf = []; return hm.zf; }
  homeMax() { return Math.min(3, (this.pan()?.max ?? 0) + 1); }
  /** 洞府禁制换算成旧的禁制等级（0 无 · 1 防贼 · 2 困贼聚灵 · 3 聚灵大阵） */
  homeLevel(): number {
    const L = this.homeLayers();
    const guard = L.filter((id) => ['kun', 'mizong', 'xuanwu', 'wuxing', 'liangyi', 'lianxi'].includes(id)).length;
    let lv = guard >= 1 ? 1 : 0;
    if (guard >= 2 || L.includes('wuxing') || L.includes('liangyi')) lv = 2;
    if (L.includes('juling') && guard >= 1) lv = Math.max(lv, 2);
    return lv;
  }
  homeJuling() { return this.homeLayers().includes('juling'); }
  homeNode(back: () => DNode): DNode {
    const g = this.game, h = g.hero, L = this.homeLayers(), max = this.homeMax();
    const opts: DOpt[] = [];
    if (!this.pan()) opts.push({ label: '（需持有阵盘方能布洞府禁制——坊市有售木阵盘）', disabled: true, act: () => null });
    else if (L.length < max) {
      for (const id of ZhenfaSys.HOME_OK) {
        if (L.includes(id)) continue;
        const z = ZHEN_BY_ID[id]; if (!z) continue;
        const cost = this.costOf(z) * 3;
        const why = !this.knows(id) ? '未参透阵图' : h.realm < z.realm ? `需${REALMS[z.realm].name}期` : this.lv < z.zd ? `需阵道「${ZD_NAME[z.zd]}」` : C.bagCount(h, 'mat_lingshi') < cost ? '灵石不足' : C.bagCount(h, 'zf_qi') + C.bagCount(h, 'zf_qi2') < z.flags ? `阵旗不足（${z.flags} 面）` : '';
        opts.push({ label: `布下${z.name}（${cost} 灵石 · 阵旗 ${z.flags} 面，永久）`, disabled: !!why, hint: why || HOME_EFFECT[id], act: () => {
          const hi = C.bagCount(h, 'zf_qi2') >= z.flags;
          C.removeItem(h, hi ? 'zf_qi2' : 'zf_qi', z.flags); C.removeItem(h, 'mat_lingshi', cost);
          L.push(id); this.gainXp(4);
          g.toast(`${g.ws.home!.name}外又添一重${z.name}。`, 'good'); audio.sfx('bell');
          return this.homeNode(back);
        } });
      }
    }
    for (const id of L) { const z = ZHEN_BY_ID[id]; if (z) opts.push({ label: `撤去${z.name}（阵旗收回）`, tone: 'bad', act: () => { L.splice(L.indexOf(id), 1); C.addItem(h, 'zf_qi', z.flags); return this.homeNode(back); } }); }
    opts.push({ label: '返回', act: () => back() });
    const names = L.map((id) => ZHEN_BY_ID[id]?.name).filter(Boolean);
    return { speaker: g.ws.home!.name, title: `洞府禁制 · ${L.length}/${max} 重 · 阵道「${ZD_NAME[this.lv]}」`, mood: 'mystic', text: `${names.length ? `洞府外已布：${names.join('、')}。` : '洞府外尚无阵法禁制。'}\n\n重数取决于阵盘（木 / 铜阵盘 2 重，玉阵盘 3 重）。护府之阵防贼困贼，聚灵阵让洞府灵气更足，敛息阵让仇家寻不到你的洞府。`, options: opts };
  }

  // ------------------------------------------------------------ 绘制
  collect(out: Drawable[], view: { left: number; top: number; right: number; bottom: number }, t: number) {
    for (const i of this.list) {
      if (i.dead || i.map !== ACTIVE_MAP) continue;
      if (i.x + i.r < view.left - 100 || i.x - i.r > view.right + 100 || i.y + i.r < view.top - 200 || i.y - i.r > view.bottom + 200) continue;
      out.push({ y: i.y - i.r * SQ - 4, k: 'D·阵法', draw: (g) => this.drawCircle(g, i, t) });
      this.collectFlags(out, i, t);
      const showEye = i.owner === 'p' || this.seeEyes || !i.hidden || Math.hypot(i.eye.x - this.game.player.x, i.eye.y - this.game.player.y) < 160;
      if (showEye) out.push({ y: i.eye.y, k: 'D·阵法', draw: (g) => this.drawEye(g, i, t) });
      else if (Math.hypot(i.eye.x - this.game.player.x, i.eye.y - this.game.player.y) < 300) out.push({ y: i.eye.y, k: 'D·阵法', draw: (g) => this.drawEyeHint(g, i, t) });
      if (i.def.id === 'xuanwu' || i.def.id === 'liangyi') out.push({ y: i.y + i.r * SQ + 6, k: 'D·阵法', draw: (g) => this.drawDome(g, i, t) });
      if (i.def.id === 'mizong') out.push({ y: i.y + i.r * SQ, k: 'D·阵法', draw: (g) => this.drawFog(g, i, t) });
    }
    for (const f of this.fx) out.push({ y: f.k === 'activate' || f.k === 'break' ? f.y - (f.r ?? 100) * SQ : f.y + 2, k: 'D·阵法', draw: (g) => this.drawFx(g, f) });
  }
  private flagPos(i: ZhenInst) { const n = i.flags, o: [number, number][] = []; for (let k = 0; k < n; k++) { const an = (k / n) * TAU + 0.3; o.push([i.x + Math.cos(an) * i.r * 0.93, i.y + Math.sin(an) * i.r * 0.93 * SQ]); } return o; }
  private drawCircle(g: G, i: ZhenInst, t: number) {
    const z = i.def, R = i.r;
    const born = clamp(i.t / 0.8, 0, 1), fade = i.left < 3 && i.untilDay === undefined ? i.left / 3 : 1;
    const a = born * fade * (i.owner === 'e' ? 0.85 : 0.9);
    const im = v53(i.owner === 'e' ? (z.id === 'dihuo' ? 'zf_dihuo' : 'zf_gujin') : z.img);
    g.save();
    g.translate(i.x, i.y); g.scale(1, SQ);
    g.rotate(t * (z.cat === '杀' ? 0.18 : 0.07) * (i.owner === 'e' ? -1 : 1));
    const s = R * (0.8 + 0.2 * born);
    if (im) {
      g.globalAlpha *= a * 0.95;
      g.drawImage(im, -s, -s, s * 2, s * 2);
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha *= 0.35 + 0.15 * Math.sin(t * 2.2);
      g.drawImage(im, -s, -s, s * 2, s * 2);
      // 反向转的符纹带（白图染主色）
      const band = v53('zf_layer_band');
      if (band) { g.rotate(-t * 0.25); g.globalAlpha = a * 0.22; g.drawImage(band, -s * 1.02, -s * 1.02, s * 2.04, s * 2.04); }
    } else {
      g.globalCompositeOperation = 'lighter'; g.globalAlpha *= a;
      g.strokeStyle = `rgba(${z.color},0.8)`; g.lineWidth = 6;
      g.beginPath(); g.arc(0, 0, s, 0, TAU); g.stroke();
      g.lineWidth = 2; g.beginPath(); g.arc(0, 0, s * 0.82, 0, TAU); g.stroke();
      g.beginPath(); for (let k = 0; k <= i.flags; k++) { const an = (k * 2 % i.flags) / i.flags * TAU; const px = Math.cos(an) * s * 0.82, py = Math.sin(an) * s * 0.82; if (k) g.lineTo(px, py); else g.moveTo(px, py); } g.stroke();
    }
    g.restore();
  }
  private collectFlags(out: Drawable[], i: ZhenInst, t: number) {
    const kinds = i.owner === 'e' ? Array(i.flags).fill('mo') : FLAG_OF[i.def.id] ?? Array(i.flags).fill('jin');
    // P2：阵旗立起来（原先没给脚底和范围，平铺在地上）；范围含起阵瞬间旗下那道三百高的光柱
    this.flagPos(i).forEach(([x, y], k) => out.push({ y, hx: x, hy: y, hb: [-70, 70, -330, 24], k: 'D·阵旗', draw: (g) => this.drawFlag(g, kinds[k % kinds.length], x, y, i, t, k) }));
  }
  private drawFlag(g: G, kind: string, x: number, y: number, i: ZhenInst, t: number, k: number) {
    const born = clamp((i.t - k * 0.05) / 0.35, 0, 1); if (born <= 0) return;
    const key = 'zf_flag_' + kind, im = v53(key), M = meta53(key);
    const H = 150 * (0.6 + 0.4 * born), drop = (1 - born) * 120;
    g.save();
    g.fillStyle = 'rgba(30,26,20,0.25)'; g.beginPath(); g.ellipse(x, y + 2, 14, 5, 0, 0, TAU); g.fill();
    // 旗下光柱（起阵瞬间亮）
    const glow = Math.max(0, 1 - i.t / 1.2);
    if (glow > 0) { const pl = v53('zf_pillar'); g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha *= glow; if (pl) g.drawImage(pl, x - 22, y - 300, 44, 300); g.restore(); }
    if (im && M) {
      const w = H * M.w / M.h, sway = Math.sin(t * 2 + k) * 0.02;
      g.translate(x, y - drop); g.rotate(sway);
      g.drawImage(im, -w * (M.ax ?? 0.5), -H * (M.ay ?? 1), w, H);
    } else {
      g.strokeStyle = '#6a5030'; g.lineWidth = 3; g.beginPath(); g.moveTo(x, y - drop); g.lineTo(x, y - drop - H); g.stroke();
      g.fillStyle = `rgba(${i.def.color},0.9)`; g.beginPath(); g.moveTo(x, y - drop - H); g.lineTo(x + 40, y - drop - H + 16 + Math.sin(t * 3 + k) * 4); g.lineTo(x, y - drop - H + 34); g.fill();
    }
    g.restore();
  }
  private drawEye(g: G, i: ZhenInst, t: number) {
    const key = i.owner === 'e' ? 'zf_eye_stone_ancient' : 'zf_eye_stone', im = v53(key), M = meta53(key);
    const x = i.eye.x, y = i.eye.y, W = 64;
    g.save();
    g.fillStyle = 'rgba(30,26,20,0.28)'; g.beginPath(); g.ellipse(x, y + 2, 30, 9, 0, 0, TAU); g.fill();
    if (im && M) { const h = W * M.h / M.w; g.drawImage(im, x - W * (M.ax ?? 0.5), y - h * (M.ay ?? 1), W, h); }
    else { g.fillStyle = '#6f7a78'; g.fillRect(x - 24, y - 34, 48, 34); }
    // 灵石灵光
    g.globalCompositeOperation = 'lighter';
    const c = i.def.color, a = 0.55 + 0.25 * Math.sin(t * 4);
    const gr = g.createRadialGradient(x, y - 40, 1, x, y - 40, 36);
    gr.addColorStop(0, `rgba(${i.owner === 'e' ? '220,90,255' : c},${a})`); gr.addColorStop(1, `rgba(${c},0)`);
    g.fillStyle = gr; g.beginPath(); g.arc(x, y - 40, 36, 0, TAU); g.fill();
    const eye = v53('zf_eye');
    if (eye && (i.owner === 'e' || this.focus === i)) { g.globalAlpha = 0.8; g.translate(x, y - 46); g.rotate(t); g.drawImage(eye, -42, -42, 84, 84); }
    g.restore();
    if (i.owner === 'p' && i.eye.hp < i.eye.max) {
      const k = clamp(i.eye.hp / i.eye.max, 0, 1);
      g.save(); g.fillStyle = 'rgba(20,16,10,0.5)'; g.fillRect(x - 26, y - 76, 52, 5); g.fillStyle = k > 0.35 ? `rgba(${c},0.95)` : 'rgba(255,110,80,0.95)'; g.fillRect(x - 26, y - 76, 52 * k, 5); g.restore();
    }
    if (this.focus === i) {
      g.save(); g.font = 'bold 15px "Noto Serif SC", serif'; g.textAlign = 'center';
      g.fillStyle = 'rgba(20,16,10,0.6)'; g.fillText(i.owner === 'e' ? '破阵眼' + keyNote('interact') : `${i.def.name}${keyNote('interact')}`, x + 1, y - 89);
      g.fillStyle = i.owner === 'e' ? '#ffb0a0' : '#f4e8c8'; g.fillText(i.owner === 'e' ? '破阵眼' + keyNote('interact') : `${i.def.name}${keyNote('interact')}`, x, y - 90);
      g.restore();
    }
  }
  /** 看不穿阵眼时：走近有一丝灵光闪动 */
  private drawEyeHint(g: G, i: ZhenInst, t: number) {
    const d = Math.hypot(i.eye.x - this.game.player.x, i.eye.y - this.game.player.y);
    const a = clamp((300 - d) / 160, 0, 1) * (0.3 + 0.3 * Math.sin(t * 6));
    g.save(); g.globalCompositeOperation = 'lighter';
    const gr = g.createRadialGradient(i.eye.x, i.eye.y - 30, 1, i.eye.x, i.eye.y - 30, 40);
    gr.addColorStop(0, `rgba(230,150,255,${a})`); gr.addColorStop(1, 'rgba(230,150,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(i.eye.x, i.eye.y - 30, 40, 0, TAU); g.fill();
    g.restore();
  }
  private drawDome(g: G, i: ZhenInst, t: number) {
    const im = v53('zf_dome'), crack = v53('zf_dome_crack');
    const born = clamp(i.t / 0.6, 0, 1), k = clamp(i.eye.hp / i.eye.max, 0, 1);
    const W = i.r * 2.15, H = W * 0.75;
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha *= born * (0.32 + 0.08 * Math.sin(t * 2)) * (0.5 + 0.5 * k);
    const cy = i.y - H * 0.38 + i.r * SQ * 0.35;
    if (im) {
      g.drawImage(im, i.x - W / 2, cy - H / 2, W, H);
      if (crack && k < 0.5) { g.globalAlpha = (0.5 - k) * 1.4; g.drawImage(crack, i.x - W / 2, cy - H / 2, W, H); }
    } else {
      const gr = g.createRadialGradient(i.x, i.y - i.r * 0.4, i.r * 0.3, i.x, i.y - i.r * 0.4, i.r);
      gr.addColorStop(0, `rgba(${i.def.color},0.05)`); gr.addColorStop(0.85, `rgba(${i.def.color},0.25)`); gr.addColorStop(1, `rgba(${i.def.color},0)`);
      g.fillStyle = gr; g.beginPath(); g.ellipse(i.x, i.y, i.r, i.r * 0.9, 0, Math.PI, TAU); g.fill();
    }
    g.restore();
  }
  private drawFog(g: G, i: ZhenInst, t: number) {
    const im = v53('zf_fog');
    const born = clamp(i.t / 1.2, 0, 1);
    g.save(); g.globalAlpha *= 0.55 * born;
    for (let k = 0; k < 7; k++) {
      const an = k * 0.9 + t * 0.12 * (k % 2 ? 1 : -1), rr = i.r * (0.25 + (k % 3) * 0.25);
      const x = i.x + Math.cos(an) * rr, y = i.y + Math.sin(an) * rr * SQ, s = i.r * 0.6;
      if (im) g.drawImage(im, x - s, y - s * 0.7, s * 2, s * 1.2);
      else { const gr = g.createRadialGradient(x, y, 1, x, y, s); gr.addColorStop(0, 'rgba(220,226,230,0.5)'); gr.addColorStop(1, 'rgba(220,226,230,0)'); g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, s, s * 0.6, 0, 0, TAU); g.fill(); }
    }
    g.restore();
  }
  private drawFx(g: G, f: Fx1) {
    const u = f.t / f.dur;
    g.save(); g.globalCompositeOperation = 'lighter';
    if (f.k === 'activate' || f.k === 'break') {
      const im = v53(f.k === 'activate' ? 'zf_activate' : 'zf_break'), R = (f.r ?? 200) * (0.6 + u * 0.7);
      g.globalAlpha *= Math.sin(Math.min(1, u) * Math.PI);
      if (im) { g.translate(f.x, f.y); g.scale(1, f.k === 'break' ? SQ * 1.2 : 1); g.drawImage(im, -R, -R * (f.k === 'activate' ? 1.25 : 1), R * 2, R * 2); }
      else { g.strokeStyle = `rgba(${f.color},0.9)`; g.lineWidth = 6; g.beginPath(); g.ellipse(f.x, f.y, R, R * SQ, 0, 0, TAU); g.stroke(); }
    } else if (f.k === 'shatter') {
      const im = v53('zf_shatter'), R = (f.r ?? 200) * (0.8 + u * 0.6);
      g.globalAlpha *= 1 - u;
      if (im) g.drawImage(im, f.x - R, f.y - R * 1.1, R * 2, R * 2);
    } else if (f.k === 'sword') {
      const im = v53('zf_sword'), fall = Math.min(1, u / 0.55), H = 220;
      const y = f.y - 420 * (1 - fall) - 30;
      g.globalAlpha *= u < 0.55 ? 0.6 + fall * 0.4 : 1 - (u - 0.55) / 0.45;
      if (im) g.drawImage(im, f.x - 24, y - H, 48, H);
      else { g.strokeStyle = `rgba(${f.color},0.9)`; g.lineWidth = 6; g.beginPath(); g.moveTo(f.x, y - H); g.lineTo(f.x, y); g.stroke(); }
    } else if (f.k === 'bolt') {
      const im = v53('zf_lightning'), H = 520;
      g.globalAlpha *= u < 0.55 ? 0.3 + u : 1 - (u - 0.55) / 0.45;
      if (im) g.drawImage(im, f.x - 40, f.y - H + 20, 80, H);
      else { g.strokeStyle = `rgba(${f.color},0.9)`; g.lineWidth = 4; g.beginPath(); g.moveTo(f.x, f.y - H); for (let k = 1; k <= 8; k++) g.lineTo(f.x + (Math.random() - 0.5) * 30, f.y - H + (H * k) / 8); g.stroke(); }
    } else if (f.k === 'fire') {
      const im = v53('zf_fire'), H = 230 * Math.sin(Math.min(1, u * 1.4) * Math.PI * 0.5 + 0.2);
      g.globalAlpha *= u < 0.6 ? 1 : 1 - (u - 0.6) / 0.4;
      if (u < 0.5) { g.fillStyle = `rgba(255,120,60,${0.4 * (1 - u * 2)})`; g.beginPath(); g.ellipse(f.x, f.y, 60, 20, 0, 0, TAU); g.fill(); }
      if (u > 0.3) { if (im) g.drawImage(im, f.x - H * 0.33, f.y - H, H * 0.66, H); }
    }
    g.restore();
  }
  glow(F: FxSys, t: number, dt: number) {
    for (const i of this.list) {
      if (i.dead || i.map !== ACTIVE_MAP) continue;
      const c = rgb(i.owner === 'e' ? '220,90,255' : i.def.color);
      F.glow(i.eye.x, i.eye.y - 40, 46, c, 0.12 + 0.05 * Math.sin(t * 4));
      if (i.t < dt * 1.5) for (const [x, y] of this.flagPos(i)) F.sparks(x, y - 60, c, 6, 220, 0.6, 3);
      if (Math.random() < dt * 3) { const an = Math.random() * TAU; F.sparks(i.x + Math.cos(an) * i.r * 0.9, i.y + Math.sin(an) * i.r * 0.9 * SQ, c, 1, 50, 0.9, 3, -Math.PI / 2, 0.5); }
    }
    for (const f of this.fx) if (f.t < dt * 1.5 && (f.k === 'break' || f.k === 'shatter')) F.sparks(f.x, f.y - 40, rgb(f.color), 50, 420, 0.9, 4);
  }
}
const WXN: Record<Wx, string> = { mu: '木', huo: '火', tu: '土', jin: '金', shui: '水' };
const HOME_EFFECT: Record<string, string> = {
  kun: '防贼：潜入的小贼走不出去', mizong: '防贼：来人迷失方位', xuanwu: '护府：防贼，药园不受侵扰', wuxing: '困贼：小贼被困在阵中等你回来处置',
  lianxi: '隐匿：防贼，仇家寻不到洞府', juling: '聚灵：洞府灵气 +0.3，药园多收一株', huichun: '回春：在洞府里伤势恢复更快', liangyi: '困贼：两仪流转，来贼必困',
};
