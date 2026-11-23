// 恩怨与江湖重做 · 第三批（四）：夺宝局——踩点 → 找帮手 → 动手 → 脱身
//
// 一条完整的支线，入口在江湖传音「可接的事」里。现在稳定生成两种：
//   · 怀宝之人（carrier）：某个修士得了一件法宝，这几日在某处歇脚，身边可能带着一名护卫；
//   · 洞府藏宝（cave）：某处前人洞府（地图上的 secret 小地点）里藏着一件法宝，有两三个散修 / 魔修守着。
// 四个阶段：
//   · 踩点（scout）：走到那一带（2600 以内）自动看一眼——守卫几个、什么境界、什么时机（每 90 息里有 30 息「空档」：
//     怀宝之人入定调息、洞府看守换班走开一个）；
//   · 找帮手（crew）：带上现在的队友 / 搭档，或花灵石雇一两个帮手（照护法的写法，十日）；
//   · 动手（strike）：到了跟前（800 以内）弹出选项——强攻（你先动的手），或趁空档偷（成算看空档、敛息、易容、帮手、守卫多少）；
//     偷失手就被发现、当场打起来；
//   · 脱身（escape）：得手以后离出事的地方九里以外、或者换了地图，就算脱身。用的都是已有的机制：
//     被认出来（活着的守卫看见了你、你没敛息没易容；偷的时候旁边有人看见）→ 进恩怨（血仇、热度、先手算你），他们会循迹追你，夺来的东西记在 d.lost 上（化解里能「退还」）；
//     没被认出来 → 江湖上只知道是个「无名凶手」，没人找你。你杀的守卫照第一批的规矩：没人看见、敛息易容就是无名凶手。
//
// 固定种子：都在玩家侧（每帧、game.update 的日结），随机用本模块的小随机数；守卫、帮手是 zhifa.mkNpc3 捏的人。
import type { Game } from './game';
import type { NpcData } from './npc';
import { npcMap } from './npc';
import type { DNode, DOpt } from './modal';
import { LOCATIONS, ACTIVE_MAP, WORLD_SCALE } from '../data/world';
import { realmName } from '../data/realms';
import { ITEMS, itemDef } from '../data/items';
import { dirName } from './sites';
import * as C from './cultivation';
import { audio } from './audio';
import { playOf, setFeud, markAssail, cn } from './feud';
import { mkNpc3, dropNpc3 } from './zhifa';

export type DbPh = 'lead' | 'scout' | 'crew' | 'strike' | 'escape' | 'done' | 'fail';
export interface DbJob {
  id: number; k: 'carrier' | 'cave'; ph: DbPh; item: string; itemName: string;
  /** 怀宝之人 / 洞府主人；守卫；你雇来的帮手 */
  tgt?: string; guards: string[]; hired: string[];
  x: number; y: number; map: string; place: string; day: number; p0: number;
  fight?: boolean; how?: 'fight' | 'steal'; known?: boolean; took?: boolean;
  /** 怀宝之人被杀、东西随储物袋落地：落地前你袋里有几件（了结时袋里多出来才算到手，没捡就走是落在了原地） */
  drop?: number; escP?: number; askP?: number; end?: string; endDay?: number;
}
export interface DbSave { v: 1; seq: number; job?: DbJob | null; nextDay?: number; nextP?: number; n?: number; gone?: string[] }

/** 数值：开局多久后、两局之间隔多久（日 + 游玩秒）；踩点 / 动手 / 脱身的距离；空档周期与长度（游玩秒）；雇帮手的价钱 */
export const DB = { first: 6 * 60, gapDays: 40, gapPlay: 6 * 60, scoutR: 2600, strikeR: 800, escR: 9000, cycle: 90, win: 30, hireDays: 10, maxHire: 2 };
export const hireCost = (realm: number) => Math.round(30 * Math.pow(3, Math.max(0, realm - 1)));
export const PH_NAME: Record<DbPh, string> = { lead: '线索', scout: '踩点', crew: '找帮手', strike: '动手', escape: '脱身', done: '了结', fail: '失手' };

let lcgS = 0x7e3c21;
const lcg = () => { lcgS = (Math.imul(lcgS, 1664525) + 1013904223) >>> 0; return lcgS / 4294967296; };
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

export class Duobao {
  constructor(private readonly g: Game) {}
  get S(): DbSave { const ws = this.g.ws as { db?: DbSave }; return (ws.db ??= { v: 1, seq: 1 }); }
  private t = 0;
  /** 偷不偷得手的骰子（测试里换掉） */
  rnd: () => number = lcg;
  live(j = this.S.job): j is DbJob { return !!j && j.ph !== 'done' && j.ph !== 'fail'; }
  /** 局里的人（怀宝之人 + 守卫） */
  members(j: DbJob): NpcData[] { const by = this.g.npcs.byId, out: NpcData[] = []; for (const id of [j.tgt, ...j.guards]) { const d = id ? by.get(id) : undefined; if (d) out.push(d); } return out; }
  /** 此刻是不是空档（每 cycle 息里有 win 息） */
  gap(j: DbJob) { return ((playOf(this.g) - j.p0) % DB.cycle + DB.cycle) % DB.cycle < DB.win; }
  gapLeft(j: DbJob) { const m = ((playOf(this.g) - j.p0) % DB.cycle + DB.cycle) % DB.cycle; return m < DB.win ? Math.ceil(DB.win - m) : -Math.ceil(DB.cycle - m); }

  // ============================================================ 线索
  daily() {
    const g = this.g, S = this.S, play = playOf(g);
    this.sweep();
    if (this.live()) return;
    if (play < DB.first || g.day < (S.nextDay ?? 0) || play < (S.nextP ?? 0) || g.hero.realm < 1 || g.offWorld) return;
    S.nextDay = g.day + DB.gapDays; S.nextP = play + DB.gapPlay;
    this.spawn(((S.n = (S.n ?? 0) + 1) % 2) === 1 ? 'carrier' : 'cave');
  }
  /** 生成一局（k 生成不了就换另一种） */
  spawn(k: 'carrier' | 'cave'): DbJob | null {
    const j = (k === 'carrier' ? this.mkCarrier() : this.mkCave()) ?? (k === 'carrier' ? this.mkCave() : this.mkCarrier());
    if (!j) return null;
    this.S.job = j;
    const g = this.g, ms = this.members(j);
    const t = ms.find((d) => d.id === j.tgt);
    const text = j.k === 'carrier'
      ? `听说${t?.name ?? '有人'}（${t ? realmName(t.realm, t.stage) : ''}）得了一件${j.itemName}，这几日在${j.place}歇脚${j.guards.length ? `，身边带着${j.guards.length}名护卫` : '，孤身一人'}。`
      : `${j.place}的前人洞府里藏着一件${j.itemName}，有${ms.length}个${ms.some((d) => d.faction === 'demon') ? '魔修' : '散修'}占着守。`;
    g.enyuan.news(text, { src: j.k === 'carrier' ? '过路散修' : '茶肆说书人', hook: { k: 'duobao', ref: j.id } });
    return j;
  }
  private treasure(): string {
    const t = clamp(this.g.hero.realm + 1, 1, 6);
    const L = Object.values(ITEMS).filter((it) => it.type === 'artifact' && it.tier === t);
    const L2 = L.length ? L : Object.values(ITEMS).filter((it) => it.type === 'artifact');
    return L2[Math.floor(lcg() * L2.length) % L2.length].id;
  }
  private placeName(x: number, y: number) {
    let best = null as (typeof LOCATIONS)[number] | null, bd = 1e18;
    for (const l of LOCATIONS) { if (l.map !== ACTIVE_MAP) continue; const dd = Math.hypot(l.x * WORLD_SCALE - x, l.y * WORLD_SCALE - y); if (dd < bd) { bd = dd; best = l; } }
    return best ? (bd < 2500 ? `${best.name}一带` : `${best.name}${dirName(x - best.x * WORLD_SCALE, y - best.y * WORLD_SCALE)}边`) : '荒野里';
  }
  private mkCarrier(): DbJob | null {
    const g = this.g, h = g.hero, p = g.player, S = this.S;
    const lo = Math.max(1, h.realm - 1), hi = Math.min(5, h.realm + 1);
    const pool = g.npcs.list.filter((d) => d.alive && npcMap(d) === ACTIVE_MAP && d.realm >= lo && d.realm <= hi && d.faction !== 'mortal' && !d.canon && !d.beauty && !d.bond && !d.stay && !d.gz && !d.orig && !d.mod && !d.hidden && !d.zf && d.db === undefined && !d.dazi && !d.hunting && !d.chasing && d.wanted === undefined && !(d.grudge > 0) && !g.npcs.activeOf(d.id)
      && (() => { const dd = Math.hypot(d.x - p.x, d.y - p.y); return dd > 8000 && dd < 45000; })() && !g.combat.safeAt(d.x, d.y));
    if (!pool.length) return null;
    const d = pool[Math.floor(lcg() * pool.length) % pool.length];
    const item = this.treasure(), id = S.seq++;
    d.db = id; d.tx = d.x; d.ty = d.y; d.until = g.day + 1e6; d.goal = 'stay'; (d.bag ??= {})[item] = (d.bag[item] ?? 0) + 1;
    const guards: string[] = [];
    if (lcg() < 0.6) { const gd = mkNpc3(g, { realm: d.realm, pers: 'cautious', faction: d.faction === 'demon' ? 'demon' : 'rogue', x: d.x + 160, y: d.y + 60, title: `${d.name}的护卫`, why: `给${d.name}当护卫` }, lcg); gd.db = id; guards.push(gd.id); }
    return { id, k: 'carrier', ph: 'lead', item, itemName: itemDef(item).name, tgt: d.id, guards, hired: [], x: Math.round(d.x), y: Math.round(d.y), map: ACTIVE_MAP, place: this.placeName(d.x, d.y), day: Math.floor(g.day), p0: playOf(g) };
  }
  private mkCave(): DbJob | null {
    const g = this.g, h = g.hero, p = g.player, S = this.S;
    const locs = LOCATIONS.filter((l) => l.map === ACTIVE_MAP && l.type === 'secret').map((l) => ({ l, dd: Math.hypot(l.x * WORLD_SCALE - p.x, l.y * WORLD_SCALE - p.y) })).filter((x) => x.dd > 6000 && x.dd < 70000).sort((a, b) => a.dd - b.dd);
    for (const { l } of locs.slice(0, 6)) {
      const x = l.x * WORLD_SCALE + 900, y = l.y * WORLD_SCALE + 400;
      if (g.combat.safeAt(x, y)) continue;
      const item = this.treasure(), id = S.seq++, demon = lcg() < 0.5, n = 2 + (lcg() < 0.5 ? 1 : 0);
      const guards: string[] = [];
      let owner: NpcData | null = null;
      for (let i = 0; i < n; i++) {
        const gd = mkNpc3(g, { realm: clamp(h.realm - (i === 0 ? 0 : 1), 1, 5), pers: i === 0 ? (demon ? 'ruthless' : 'greedy') : 'cautious', faction: demon ? 'demon' : 'rogue', x: x + (i - 1) * 170, y: y + (i % 2) * 120, title: i === 0 ? `占了${l.name}的${demon ? '魔修' : '散修'}` : '看守', why: `占着${l.name}的前人洞府` }, lcg);
        gd.db = id; if (i === 0) owner = gd; else guards.push(gd.id);
      }
      return { id, k: 'cave', ph: 'lead', item, itemName: itemDef(item).name, tgt: owner!.id, guards, hired: [], x: Math.round(x), y: Math.round(y), map: ACTIVE_MAP, place: l.name, day: Math.floor(g.day), p0: playOf(g) };
    }
    return null;
  }

  // ============================================================ 每帧
  frame(dt: number) {
    this.t -= dt; if (this.t > 0) return; this.t = 0.5;
    const g = this.g, j = this.S.job;
    if (!this.live(j) || g.offWorld || g.inCave) return;
    const p = g.player, play = playOf(g), dist = Math.hypot(p.x - j.x, p.y - j.y);
    if (j.ph === 'escape') {
      if (g.hero.dead) { this.finish(j, false, '你在脱身路上倒下了。'); return; }
      if ((j.map !== ACTIVE_MAP || dist > DB.escR) && !g.combat.inCombat) this.escaped(j);
      return;
    }
    if (j.map !== ACTIVE_MAP) return;
    this.post(j);
    if (j.ph === 'scout' && dist < DB.scoutR && !g.modal && !g.combat.inCombat) { j.ph = 'crew'; audio.sfx('click'); g.openDialog(this.scoutNode(j)); return; }
    if (j.ph === 'strike') {
      if (j.fight) { if (g.hero.dead) { this.finish(j, false, '动手时你倒下了。'); return; } this.fightTick(j); return; }
      if (dist < DB.strikeR && !g.modal && !g.combat.inCombat && play >= (j.askP ?? 0)) { j.askP = play + 15; g.openDialog(this.strikeNode(j)); }
    }
  }
  /** 局里的人守在各自的位置上；空档里怀宝之人入定、洞府看守走开一个 */
  private post(j: DbJob) {
    const g = this.g, gap = this.gap(j), ms = this.members(j);
    ms.forEach((d, i) => {
      if (!d.alive) return;
      const a = g.npcs.activeOf(d.id);
      if (a && (a.enemy || a.duel || a.act === 'flee')) return;
      let tx = j.x + (i - 1) * 170, ty = j.y + (i % 2) * 120;
      if (gap && j.k === 'cave' && i === ms.length - 1 && i > 0) { tx = j.x + 1300; ty = j.y + 500; }   // 换班：走开一个
      d.tx = tx; d.ty = ty;
      if (!a) { d.x = tx; d.y = ty; return; }
      if (gap && j.k === 'carrier' && d.id === j.tgt) { a.act = 'sit'; a.wait = 1.2; a.life = undefined; return; }   // 入定调息
      if (Math.hypot(a.st.x - tx, a.st.y - ty) > 60) { a.act = 'walk'; a.wait = 0; a.life = undefined; }
      else if (a.act === 'walk') { a.act = 'idle'; a.wait = 1; }
    });
  }

  // ============================================================ 对话
  hookLive(id: number) { const j = this.S.job; return !!j && j.id === id && this.live(j); }
  hookLabel(id: number) { const j = this.S.job; if (!j || j.id !== id) return '看看'; return j.ph === 'lead' ? '接下这桩事' : j.ph === 'scout' ? '去踩点' : j.ph === 'crew' ? '找帮手' : j.ph === 'strike' ? '去动手' : j.ph === 'escape' ? '脱身中' : '已了结'; }
  hookNode(id: number): DNode | null {
    const j = this.S.job; if (!j || j.id !== id || !this.live(j)) return null;
    if (j.ph === 'lead') return this.leadNode(j);
    if (j.ph === 'crew') return this.crewNode(j);
    const g = this.g, title = `夺宝局 · ${PH_NAME[j.ph]}`;
    const tip = j.ph === 'scout' ? `去${j.place}看一眼（走近就能看清守卫和时机）。` : j.ph === 'strike' ? `到${j.place}跟前动手。${this.gap(j) ? `眼下正是空档（还剩 ${this.gapLeft(j)} 息）。` : `下一个空档 ${-this.gapLeft(j)} 息后。`}` : `离${j.place}九里以外、或者换张地图，就算脱身。`;
    return { speaker: '夺宝局', title, text: `${j.itemName} · ${j.place}\n\n${tip}`, options: [{ label: '在地图上指路', tone: 'good', act: () => { g.setGuide(j.x, j.y, `夺宝：${j.place}`); return null; } }, ...(j.ph === 'scout' ? [{ label: '算了，不碰这浑水', act: () => { this.finish(j, false, '你放弃了。', true); return null; } }] : []), { label: '知道了', act: () => null }] };
  }
  leadNode(j: DbJob): DNode {
    const g = this.g, t = j.tgt ? g.npcs.byId.get(j.tgt) : undefined;
    const p = g.player, li = Math.max(1, Math.round(Math.hypot(j.x - p.x, j.y - p.y) / 5400));
    return {
      speaker: '夺宝局', title: '线索',
      text: `${j.k === 'carrier' ? `${t?.name ?? '那人'}（${t ? realmName(t.realm, t.stage) : ''}）身怀${j.itemName}` : `${j.place}的前人洞府里藏着${j.itemName}`}，在你${dirName(j.x - p.x, j.y - p.y)}边${cn(li)}里外。\n\n踩点 → 找帮手 → 动手 → 脱身。动手时被认出来，就是一桩血仇；没人认出来，江湖上只当是个「无名凶手」。`,
      options: [
        { label: '接下：先去踩点', tone: 'gold', act: () => { j.ph = 'scout'; g.setGuide(j.x, j.y, `踩点：${j.place}`); g.toast(`夺宝局：去${j.place}踩点——走近就能看清守卫和时机。`, 'info'); return null; } },
        { label: '不碰这浑水', act: () => { this.finish(j, false, '你没接这桩事。', true); return null; } },
      ],
    };
  }
  /** 踩点：守卫、时机 */
  scoutNode(j: DbJob): DNode {
    const g = this.g, ms = this.members(j).filter((d) => d.alive);
    const list = ms.map((d) => `· ${d.name}（${realmName(d.realm, d.stage)}）${d.id === j.tgt ? (j.k === 'carrier' ? '——怀宝之人' : '——洞府主人') : '——' + (d.title ?? '守卫')}`).join('\n');
    const when = j.k === 'carrier' ? `${ms.find((d) => d.id === j.tgt)?.name ?? '他'}每过一阵就入定调息，入定时神识收敛——那是下手偷的空档（每 ${DB.cycle} 息里有 ${DB.win} 息）。` : `看守每 ${DB.cycle} 息换一次班，换班时有一个人走开（空档 ${DB.win} 息）。`;
    return {
      speaker: '踩点', title: `夺宝局 · ${j.place}`,
      text: `（你远远看了一阵）\n${list}\n\n时机：${when}\n眼下${this.gap(j) ? `正是空档（还剩 ${this.gapLeft(j)} 息）` : `不是空档（${-this.gapLeft(j)} 息后）`}。\n\n强攻是你先动的手；偷要趁空档，敛息、易容、带帮手都能让成算高些。`,
      options: [
        { label: '找帮手', tone: 'good', act: () => this.crewNode(j) },
        { label: '不找了，直接去动手', act: () => { j.ph = 'strike'; j.askP = playOf(g) + 3; return null; } },
        { label: '先撤，回头再说', act: () => null },
      ],
    };
  }
  /** 找帮手：带上队友、叫搭档来、花钱雇人 */
  crewNode(j: DbJob): DNode {
    const g = this.g, h = g.hero, mates = g.npcs.followers().length, cost = hireCost(h.realm), have = C.bagCount(h, 'mat_lingshi');
    const dz = g.dazi.cur(), dzOut = !!dz && g.npcs.activeOf(dz.id)?.act !== 'follow';
    const opts: DOpt[] = [];
    if (dzOut) opts.push({ label: `传音叫搭档${dz!.name}来`, tone: 'good', act: () => { g.npcs.summon(dz!.id); return this.crewNode(j); } });
    opts.push({ label: `花钱雇一名帮手（灵石 ${cost} · ${DB.hireDays} 日）`, disabled: have < cost || j.hired.length >= DB.maxHire, hint: j.hired.length >= DB.maxHire ? `最多雇 ${DB.maxHire} 个` : have < cost ? '灵石不足' : '雇来的人听你的队伍指令', act: () => {
      C.removeItem(h, 'mat_lingshi', cost);
      const p = g.player, d = mkNpc3(g, { realm: clamp(h.realm, 1, 5), pers: 'greedy', faction: 'rogue', x: p.x - 120, y: p.y + 40, title: '雇来的帮手', why: '收了灵石帮人办事', favor: 20 }, lcg);
      d.db = j.id; d.met = true; d.bond = 'guard'; d.bondUntil = g.day + DB.hireDays; j.hired.push(d.id);
      const a = g.npcs.summon(d.id); if (a) a.bubble = { text: '拿人钱财，与人消灾。说吧，干谁？', t: 3 };
      return this.crewNode(j);
    } });
    opts.push({ label: mates ? `就这些人（${mates} 位），去动手` : '一个人去动手', tone: 'gold', act: () => { j.ph = 'strike'; j.askP = playOf(g) + 3; g.setGuide(j.x, j.y, `动手：${j.place}`); return null; } });
    opts.push({ label: '先不急', act: () => null });
    return { speaker: '找帮手', title: `夺宝局 · ${j.place}`, text: `眼下跟着你的有 ${mates} 位${dz ? `（搭档${dz.name}${dzOut ? '不在身边' : '在'}）` : ''}${j.hired.length ? `，其中雇来的 ${j.hired.length} 位` : ''}。\n守在那里的有 ${this.members(j).filter((d) => d.alive).length} 人。\n\n帮手越多，强攻越稳、偷的时候也有人替你望风。`, options: opts };
  }
  /** 偷的成算 */
  stealP(j: DbJob) {
    const g = this.g, F = g.rel.feud, guards = this.members(j).filter((d) => d.alive).length;
    return clamp(0.2 + (this.gap(j) ? 0.35 : 0) + (g.concealed ? 0.2 : 0) + (F.disguised() ? 0.1 : 0) + Math.min(2, g.npcs.followers().length) * 0.05 - (guards - 1) * 0.06, 0.05, 0.9);
  }
  /** 动手：强攻 / 趁空档偷 / 再等等 */
  strikeNode(j: DbJob): DNode {
    const g = this.g, sp = this.stealP(j), gap = this.gap(j);
    return {
      speaker: '动手', title: `夺宝局 · ${j.place}`, mood: 'danger',
      text: `${j.itemName}就在眼前。${gap ? `正是空档（还剩 ${this.gapLeft(j)} 息）。` : `还不是空档（${-this.gapLeft(j)} 息后）。`}${g.concealed ? '你敛着气息。' : ''}${g.rel.feud.disguised() ? '你易了容。' : ''}`,
      options: [
        { label: '强攻（你先动的手）', tone: 'bad', act: () => { this.attack(j, false); return null; } },
        { label: `${gap ? '趁空档' : '硬着头皮'}下手偷（约 ${Math.round(sp * 100)}% 得手）`, tone: gap ? 'good' : undefined, act: () => this.steal(j) },
        { label: '再等等', act: () => null },
      ],
    };
  }
  /** 打起来：局里的人全都转成敌人；caught = 偷的时候被发现了 */
  attack(j: DbJob, caught: boolean) {
    const g = this.g, day = g.day;
    j.fight = true; j.how = 'fight';
    for (const d of this.members(j)) {
      if (!d.alive) continue;
      const a = g.npcs.activeOf(d.id); if (!a || a.enemy) continue;
      markAssail(d, 'hero', day); g.rel.feud.see(d);
      a.bubble = { text: caught ? '有贼！' : d.id === j.tgt ? '想夺我的东西？找死！' : '来者不善！', t: 2.5 };
      g.npcs.toEnemy(a, true);
    }
    g.dazi.onDeed(1, `为了一件${j.itemName}对人下手`);
    audio.sfx('clang');
  }
  /** 偷 */
  steal(j: DbJob): DNode | null {
    const g = this.g;
    if (this.rnd() < this.stealP(j)) {
      j.how = 'steal';
      const t = j.tgt ? g.npcs.byId.get(j.tgt) : undefined;
      if (j.k === 'carrier' && t?.bag?.[j.item]) { t.bag[j.item] -= 1; if (t.bag[j.item] <= 0) delete t.bag[j.item]; }
      C.addItem(g.hero, j.item, 1);
      this.took(j);
      audio.sfx('chime');
      return { speaker: '动手', title: `夺宝局 · 得手`, text: `（你屏住气息，从${j.k === 'carrier' ? `${t?.name ?? '他'}身侧` : '洞府深处'}摸走了${j.itemName}，没惊动任何人）\n\n${j.known ? '——可旁边有人看见了你。快走！' : '没人看见。'}\n\n脱身：离开这一带九里以外，或者换张地图。`, options: [{ label: '（快走）', act: () => null }] };
    }
    this.attack(j, true);
    return { speaker: '动手', title: '夺宝局 · 失手', mood: 'danger', text: '（脚下一块碎石滚落——守着的人猛地回头）\n\n被发现了！', options: [{ label: '（迎战）', act: () => null }] };
  }
  /** 打着：局里的人都倒了 / 跑了，东西就到手了 */
  private fightTick(j: DbJob) {
    const g = this.g;
    let up = 0;
    for (const d of this.members(j)) {
      if (!d.alive) continue;
      const a = g.npcs.activeOf(d.id), e = a?.enemy;
      if (e && !e.dead && g.combat.enemies.includes(e) && e.aggro) up++;
    }
    if (up > 0) return;
    const t = j.tgt ? g.npcs.byId.get(j.tgt) : undefined;
    if (j.k === 'cave' || t?.alive) { if (t?.alive && t.bag?.[j.item]) { t.bag[j.item] -= 1; if (t.bag[j.item] <= 0) delete t.bag[j.item]; } C.addItem(g.hero, j.item, 1); g.toast(`夺得${j.itemName}！快走——离开这一带就算脱身。`, 'good', { lv: 'high' }); }
    else { j.drop ??= C.bagCount(g.hero, j.item); g.toast(`${t?.name ?? '他'}的储物袋落了地，${j.itemName}就在里面——捡起来才算到手。快走！`, 'good', { lv: 'high' }); }
    this.took(j);
  }
  /** 东西到手：被没被认出来 */
  private took(j: DbJob) {
    const g = this.g, F = g.rel.feud, day = g.day, p = g.player;
    j.took = true; j.ph = 'escape'; j.escP = playOf(g); j.fight = false;
    const alive = this.members(j).filter((d) => d.alive);
    const hidden = F.hidden();
    const wit = F.witnesses(j.x, j.y, this.members(j)).length;
    j.known = !hidden && (j.how === 'fight' ? alive.length > 0 || wit > 0 : wit > 0);
    const owner = j.tgt ? g.npcs.byId.get(j.tgt) : undefined;
    if (j.known) {
      const seen = { day, x: Math.round(p.x), y: Math.round(p.y), map: ACTIVE_MAP, look: F.lookSig() };
      for (const d of alive) { setFeud(d, { grudge: 2, heat: 62, by: 'hero', day, why: `你在${j.place}夺走了${j.itemName}`, seen }); d.hunting = true; if (d.id === j.tgt) d.lost = { item: j.item }; }
      g.enyuan.news(`苏寒在${j.place}夺走了${owner?.name ?? '旁人'}的${j.itemName}。${alive.length ? `${alive.map((d) => d.name).join('、')}放话要找他算账。` : ''}`, { tone: 'bad' });
      g.toast(`你被认出来了——${alive.length ? `${alive.map((d) => d.name).join('、')}记下了你的脸` : '有人看见了你'}。快脱身！`, 'warn', { lv: 'high' });
    } else {
      g.enyuan.news(`${j.place}出了一桩夺宝案：${owner?.name ?? '有人'}的${j.itemName}被人夺走，没人看清是谁——江湖上都叫他「无名凶手」。`, { tone: 'mid' });
      if (owner?.alive) owner.why = `${j.itemName}被无名凶手夺走`;
    }
    g.dazi.onDeed(j.how === 'steal' ? 0 : 1, `夺了${owner?.name ?? '旁人'}的${j.itemName}`);
  }
  private escaped(j: DbJob) {
    const g = this.g;
    // 储物袋落了地却没捡：东西留在原地，这一局不算到手
    if (j.drop !== undefined && C.bagCount(g.hero, j.item) <= j.drop) {
      this.finish(j, false, `${j.itemName}随储物袋落在${j.place}，你没捡就走了。${j.known ? '人倒是被认了出来——这笔账照样记进恩怨页。' : ''}`);
      g.toast(`夺宝局了结：${j.itemName}没到手——落在了原地${j.known ? '（被认出来了，进了恩怨）' : ''}。`, 'warn', { lv: 'high' });
      g.rel.log(`在${j.place}夺宝，人杀了，${j.itemName}却没捡走${j.known ? '，还被人认了出来' : ''}。`, 'bad');
      return;
    }
    this.finish(j, true, j.known ? `你带着${j.itemName}脱了身。可他们认得你——这笔账记进了恩怨页。` : `你带着${j.itemName}脱了身。没人知道是你。`);
    g.toast(`夺宝局了结：${j.itemName}到手${j.known ? '（被认出来了，进了恩怨）' : '（无名凶手）'}。`, j.known ? 'warn' : 'good', { lv: 'high' });
    g.rel.log(`在${j.place}夺得${j.itemName}${j.known ? '，被人认了出来' : '，没人知道是你'}。`, j.known ? 'bad' : 'good');
  }
  /** 一局了结：局里的人回归日常；捏出来的守卫没和你打过交道的，过后收走 */
  finish(j: DbJob, ok: boolean, why: string, quiet = false) {
    const g = this.g, S = this.S;
    j.ph = ok ? 'done' : 'fail'; j.end = why; j.endDay = Math.floor(g.day);
    for (const d of this.members(j)) { d.db = undefined; d.until = 0; if (d.id.startsWith('f3_')) (S.gone ??= []).push(d.id); }
    for (const id of j.hired) { const d = g.npcs.byId.get(id); if (d) d.db = undefined; }
    if (!quiet) g.enyuan.news(`夺宝局（${j.place}）了结：${why}`, { tone: ok ? 'mid' : 'bad', quiet: true });
  }
  private sweep() { const g = this.g, S = this.S; if (!S.gone?.length) return; S.gone = S.gone.filter((id) => { const d = g.npcs.byId.get(id); return !!d && d.alive && !dropNpc3(g, d); }); }
  /** 你杀了局里的人却没走动手的对话（直接拔剑）：当强攻算 */
  onKill(d: NpcData) {
    const j = this.S.job; if (!this.live(j) || d.db !== j.id || j.ph === 'escape' || j.hired.includes(d.id)) return;
    if (j.ph !== 'strike') j.ph = 'strike';
    if (!j.fight) { j.fight = true; j.how = 'fight'; }
    // 怀宝之人倒了：记下储物袋落地前你袋里有几件（还没来得及捡）
    if (j.k === 'carrier' && d.id === j.tgt) j.drop ??= C.bagCount(this.g.hero, j.item);
  }

  // ============================================================ 显示
  /** 顶栏横幅 */
  banner(): { ph: DbPh; title: string; tip: string; gap: number } | null {
    const j = this.S.job; if (!this.live(j) || j.ph === 'lead') return null;
    const g = this.g, p = g.player, dd = Math.hypot(j.x - p.x, j.y - p.y), li = Math.max(1, Math.round(dd / 5400)), dir = dirName(j.x - p.x, j.y - p.y), at = dd < 1500 ? '就在跟前' : `${dir}${cn(li)}里`;
    const tip = j.ph === 'scout' ? `去${j.place}看一眼（${at}）` : j.ph === 'crew' ? '找帮手：江湖传音里点「找帮手」' : j.ph === 'strike' ? (j.fight ? '打退守着的人' : `到${j.place}跟前动手（${at}）`) : `脱身：离开${j.place}九里以外 / 换图${j.known ? ' · 被认出来了' : ''}`;
    return { ph: j.ph, title: j.itemName, tip, gap: j.ph === 'strike' || j.ph === 'crew' ? this.gapLeft(j) : 0 };
  }
  marks(): { x: number; y: number; glyph: string; color: string; ring?: number; name: string }[] {
    const j = this.S.job; if (!this.live(j) || j.ph === 'lead' || j.map !== ACTIVE_MAP) return [];
    return [{ x: j.x, y: j.y, glyph: '宝', color: '#e8c060', ring: j.ph === 'escape' ? DB.escR : undefined, name: `夺宝局（${PH_NAME[j.ph]}）：${j.itemName}` }];
  }
}
