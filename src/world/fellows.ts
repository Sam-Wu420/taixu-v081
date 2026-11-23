// 结伴（第二、三步）：NPC 结成长期的队伍，各有作风；你的队伍也可以定作风。
//
// 五种作风：
//   猎妖队（猎）  三五人进山猎妖，妖丹、灵石按出力分（队长多拿三成）；有人会在猎妖时受伤、陨落
//   采药搭档（采）两人结伴进险地采药，平分
//   商队与护卫（商）行商领着两三个护卫在城与城之间跑货，赚差价；护卫按趟拿工钱；劫修团伙的目标
//   劫修团伙（劫）埋伏在路上劫商队，也会盯上落单的你；赃物队长拿四成
//   师徒（师）    师父带一两个徒弟历练；徒弟卡在瓶颈时师父出钱去万宝楼给他寻破境丹
// 队伍会解散、会被团灭，也会有人卷了公共钱袋跑路（贪婪、狠辣的人更容易）。
// 一切都记在世界状态里（ws.fellows），按日结算；队员走在一起（找去处时跟着队长走，见 npc.ts 的 pickTarget）。
// 你遇到一支队伍：攀谈、入伙（他们成了你的同行者，你的队伍作风跟着定）、受雇护送商队（护到目的地拿工钱）。
// 你自己的队伍也可以在队伍框里定作风：猎妖——同行者打妖兽更狠，妖丹分他们三成；采药——你采药时他们帮着多采一份；
// 劫道——同行者跟你一起劫人，分走四成，正道声望掉得更快；传道——你的徒弟同行时修为长得快。
import { KEY_PILL } from './living';
import { setRobCd, robGuard } from './feud';   // 恩怨重做：劫修团伙劫道冷却按天数 + 游玩时间
import { wbZoneOf } from './wanbao';
import type { Game } from './game';
import type { NpcData } from './npc';
import type { DNode, DOpt } from './modal';
import { LOC_BY_ID, ACTIVE_MAP, locsOf, WORLD_SCALE, type LocDef, type MapId } from '../data/world';
import { REALMS, realmName } from '../data/realms';
import { itemDef } from '../data/items';
import { flow } from './econ';
import * as C from './cultivation';
import { audio } from './audio';

export type StyleK = 'hunt' | 'herb' | 'caravan' | 'bandit' | 'mentor';
export const STYLE_DEF: Record<StyleK, { name: string; seal: string; color: string; size: [number, number]; desc: string; player: string }> = {
  hunt: { name: '猎妖队', seal: '猎', color: '#8e2a20', size: [3, 5], desc: '三五人进山猎妖，妖丹灵石按出力分，队长多拿三成。', player: '同行者打妖兽更狠（伤害多两成半）；你拾到的妖丹分他们三成。' },
  herb: { name: '采药搭档', seal: '采', color: '#2f6b5e', size: [2, 2], desc: '两人结伴进险地采药，所得平分。', player: '你采药时同行者帮着多采一份；遇敌时他们先护着你退。' },
  caravan: { name: '商队', seal: '商', color: '#b8802a', size: [3, 4], desc: '行商领着护卫在城与城之间跑货赚差价，护卫按趟拿工钱。', player: '护送商队时用：护到目的地，按人头拿工钱。' },
  bandit: { name: '劫修团伙', seal: '劫', color: '#3a2a40', size: [3, 4], desc: '埋伏在商路和坊市外，劫商队，也盯落单的修士；赃物队长拿四成。', player: '同行者跟你一起劫人，赃物分走四成；正道声望掉得更快。' },
  mentor: { name: '师徒', seal: '师', color: '#3a6a9a', size: [2, 3], desc: '师父带徒弟历练；徒弟卡在瓶颈时，师父出钱寻破境丹。', player: '你的徒弟同行时，他修为长得快，你也略有感悟。' },
};
/** 每张图各种作风的队伍保持几支 */
const WANT: Record<StyleK, number> = { hunt: 4, herb: 3, caravan: 2, bandit: 2, mentor: 3 };

export interface Fellowship {
  id: number; style: StyleK; map: MapId;
  leader: string; members: string[];
  /** 公共钱袋（灵石） */
  purse: number;
  formed: number; until: number;
  /** 商队：从哪座城到哪座城；劫修：埋伏在哪 */
  from?: string; to?: string; lair?: string;
  /** 跑了几趟 / 猎了几回 */
  runs: number;
  /** 你雇的：护送到期日；你入的伙 */
  hired?: { until: number; pay: number };
  joined?: boolean;
}
interface FwState { seq: number; list: Fellowship[]; log: { day: number; text: string }[]; last: number; style?: StyleK | null;
  /** 这个月各图结伴营生（猎妖、采药、跑货）还能挣多少：世上的妖兽、灵草、生意就这么多，挣满了再做只得一成 */
  bud?: Record<string, number>; budM?: number }

const NAME_A = '青赤玄白金铁烈孤寒苍云风';
const NAME_B = '狼鹰蛟虎鹤蛇豹蝎鸦';
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

export class FellowsSys {
  constructor(private readonly game: Game) {}
  get S(): FwState { const ws = this.game.ws as unknown as { fellows?: FwState }; return (ws.fellows ??= { seq: 1, list: [], log: [], last: this.game.day }); }
  /** 你的队伍的作风（没定是 null） */
  get myStyle(): StyleK | null { return this.S.style ?? null; }
  setMyStyle(s: StyleK | null) {
    this.S.style = s;
    for (const a of this.game.npcs.followers()) (a.d as NpcData & { pstyle?: string }).pstyle = s ?? undefined;
    if (s) this.game.toast(`同行定下作风：${STYLE_DEF[s].name}——${STYLE_DEF[s].player}`, 'good');
  }

  of(d: NpcData): Fellowship | undefined { const id = (d as NpcData & { fw?: number }).fw; return id ? this.S.list.find((f) => f.id === id) : undefined; }
  name(f: Fellowship): string {
    const L = this.game.npcs.byId.get(f.leader);
    if (f.style === 'mentor') return `${L?.name ?? ''}师徒`;
    if (f.style === 'caravan') return `${LOC_BY_ID.get(f.from ?? '')?.name ?? ''}${L?.name?.[0] ?? ''}家商队`;
    if (f.style === 'herb') return `${L?.name ?? ''}一行`;
    return `${NAME_A[f.id % NAME_A.length]}${NAME_B[(f.id * 7) % NAME_B.length]}${STYLE_DEF[f.style].name.slice(-1) === '伙' ? '帮' : '队'}`;
  }
  private log(text: string) { const S = this.S; S.log.unshift({ day: Math.floor(this.game.day), text }); if (S.log.length > 60) S.log.length = 60; }
  private bind(d: NpcData, f: Fellowship | null) {
    const D = d as NpcData & { fw?: number; pstyle?: string };
    if (f) { D.fw = f.id; D.pstyle = f.style; } else { delete D.fw; if (!this.game.npcs.followers().some((a) => a.d === d)) delete D.pstyle; }
  }
  private free(d: NpcData): boolean {
    const D = d as NpcData & { fw?: number };
    return d.alive && !D.fw && !d.canon && !d.beauty && !d.ros && !d.gz && !d.bond && !d.stay && !d.hunting && !d.chasing && d.realm >= 1;
  }

  // ------------------------------------------------------------ 每日
  daily(): void {
    const S = this.S, g = this.game, day = g.day;
    if (day - S.last < 5) return;
    const days = day - S.last; S.last = day;
    // 队员死了的、散伙的
    for (const f of S.list.slice()) {
      f.members = f.members.filter((id) => g.npcs.byId.get(id)?.alive);
      if (!f.members.includes(f.leader)) f.leader = f.members[0] ?? '';
      if (f.joined || f.hired) continue;
      if (f.members.length < 2 || day > f.until) this.dissolve(f, f.members.length < 2 ? '人手凋零' : '各奔前程');
    }
    // 组队：每张人界图各种作风保持几支
    for (const m of ['tiannan', 'luanxing', 'dajin'] as MapId[]) for (const k of Object.keys(WANT) as StyleK[]) {
      const n = S.list.filter((f) => f.map === m && f.style === k).length;
      if (n < WANT[k] && Math.random() < 0.5) this.form(k, m);
    }
    for (const f of S.list.slice()) if (!f.joined) this.act(f, days);
    // 你的队伍作风·传道：徒弟同行时修为长得快，你也略有感悟
    if (this.myStyle === 'mentor') for (const a of g.npcs.followers()) {
      const d = a.d; if (d.bond !== 'disciple') continue;
      if (d.stage < REALMS[d.realm].stages.length - 1 && Math.random() < 0.06 * days / 5) { d.stage++; a.bubble = { text: '师父，我又有精进了！', t: 2.2 }; }
      C.gainExp(g.hero, C.need(g.hero) * C.INSIGHT * 0.004 * days / 5, []);
    }
  }

  /** 组一支队伍 */
  form(k: StyleK, map: MapId): Fellowship | null {
    const g = this.game, S = this.S, def = STYLE_DEF[k];
    const pool = g.npcs.list.filter((d) => this.free(d) && (d.map ?? 'tiannan') === map);
    if (pool.length < def.size[0]) return null;
    const pick = (f: (d: NpcData) => boolean) => { const c = pool.filter(f); if (!c.length) return null; const d = c[Math.floor(Math.random() * c.length)]; pool.splice(pool.indexOf(d), 1); return d; };
    let leader: NpcData | null = null;
    const members: NpcData[] = [];
    if (k === 'caravan') leader = pick((d) => d.faction === 'merchant') ?? pick((d) => d.pers === 'greedy');
    else if (k === 'bandit') leader = pick((d) => (d.pers === 'ruthless' || d.pers === 'greedy') && d.realm >= 2) ?? pick((d) => d.faction === 'demon');
    else if (k === 'mentor') leader = pick((d) => d.realm >= 3);
    else leader = pick((d) => d.realm >= 2) ?? pick(() => true);
    if (!leader) return null;
    const n = def.size[0] + Math.floor(Math.random() * (def.size[1] - def.size[0] + 1));
    for (let i = 1; i < n; i++) {
      const m = k === 'mentor' ? pick((d) => d.realm < leader!.realm && (!leader!.sect || d.sect === leader!.sect || !d.sect))
        : k === 'bandit' ? pick((d) => d.pers === 'ruthless' || d.pers === 'greedy' || d.faction === 'demon')
        : k === 'caravan' ? pick((d) => d.faction !== 'mortal' && d.realm >= Math.max(1, leader!.realm - 1))
        : pick((d) => Math.abs(d.realm - leader!.realm) <= 1);
      if (m) members.push(m);
    }
    if (members.length + 1 < def.size[0]) return null;
    const cities = locsOf(map).filter((l) => (l.type === 'city' || l.type === 'isle') && !l.minor);
    const f: Fellowship = { id: S.seq++, style: k, map, leader: leader.id, members: [leader.id, ...members.map((m) => m.id)], purse: 0, formed: g.day, until: g.day + 180 + Math.random() * 540, runs: 0 };
    if (k === 'caravan' && cities.length >= 2) { const a = cities[Math.floor(Math.random() * cities.length)]; let b = a; for (let t = 0; t < 8 && b === a; t++) b = cities[Math.floor(Math.random() * cities.length)]; f.from = a.id; f.to = b.id; }
    if (k === 'bandit') { const r = locsOf(map).filter((l) => l.type === 'danger' || (l.minor && l.type !== 'city')); f.lair = r.length ? r[Math.floor(Math.random() * r.length)].id : leader.home; }
    S.list.push(f);
    for (const id of f.members) this.bind(g.npcs.byId.get(id)!, f);
    return f;
  }
  private dissolve(f: Fellowship, why: string) {
    const g = this.game, S = this.S;
    this.split(f);
    for (const id of f.members) { const d = g.npcs.byId.get(id); if (d) this.bind(d, null); }
    S.list = S.list.filter((x) => x !== f);
    if (f.runs > 2 && Math.random() < 0.3) this.log(`${this.name(f)}${why}，就此散伙。`);
  }
  /** 分钱：按作风的规矩 */
  private split(f: Fellowship) {
    const g = this.game, ms = f.members.map((id) => g.npcs.byId.get(id)).filter((d): d is NpcData => !!d?.alive);
    if (!ms.length || f.purse <= 0) { f.purse = 0; return; }
    const lead = f.style === 'hunt' ? 0.3 : f.style === 'bandit' ? 0.4 : f.style === 'caravan' ? 0.7 : 0;
    const L = ms.find((d) => d.id === f.leader);
    let rest = f.purse;
    if (L && lead) { const v = Math.round(f.purse * lead); L.wealth += v; rest -= v; }
    const others = lead && L ? ms.filter((d) => d !== L) : ms;
    const pw = others.map((d) => (f.style === 'hunt' ? Math.pow(2, d.realm) : 1)), tot = pw.reduce((a, b) => a + b, 0) || 1;
    others.forEach((d, i) => { d.wealth += Math.round(rest * pw[i] / tot); });
    f.purse = 0;
  }

  /** 结伴营生挣的钱：这个月这张图的额度之内照付，超出的只付一成 */
  private earn(map: string, v: number): number {
    const S = this.S, m = Math.floor(this.game.day / 30);
    if (S.budM !== m) { S.budM = m; S.bud = {}; }
    const b = (S.bud ??= {});
    if (b[map] === undefined) b[map] = 3500 * this.game.wanbao.econK;
    const inB = Math.min(v, Math.max(0, b[map])); b[map] -= inB;
    return Math.round(inB + (v - inB) * 0.1);
  }
  /** 队伍过几天：按作风做事 */
  private act(f: Fellowship, days: number) {
    const g = this.game, N = g.npcs, ms = f.members.map((id) => N.byId.get(id)).filter((d): d is NpcData => !!d?.alive);
    if (ms.length < 2) return;
    const power = ms.reduce((s, d) => s + Math.pow(2.2, d.realm) * (1 + d.stage * 0.2), 0);
    const L = N.byId.get(f.leader)!;
    const roll = Math.random(), k = days / 30;
    if (f.style === 'hunt' || f.style === 'herb') {
      if (roll > 0.55 * k + 0.1) return;
      f.runs++;
      const risk = f.style === 'hunt' ? 0.04 : 0.02;
      const gain = Math.round((f.style === 'hunt' ? 35 : 15) * Math.pow(2.2, L.realm) * (0.6 + Math.random()) * g.wanbao.econK);
      const got = this.earn(f.map, gain); f.purse += got; flow(f.style === 'hunt' ? 'hunt' : 'herbs', got);
      if (f.style === 'hunt') { const lv = Math.max(1, Math.min(8, L.realm * 2 + 1)); const b = (L.bag ??= {}); const id = 'mat_yaodan' + lv; if (itemDef(id)) b[id] = (b[id] ?? 0) + 1; }
      else { for (const d of ms) { const b = (d.bag ??= {}); b.herb_lingzhi = (b.herb_lingzhi ?? 0) + 1; } }
      if (Math.random() < risk) {
        const v = ms[1 + Math.floor(Math.random() * (ms.length - 1))];
        if (Math.random() < 0.12) { g.npcs.die(v, f.style === 'hunt' ? '猎妖时陨落' : '采药时遭妖兽所害'); this.log(`${this.name(f)}${f.style === 'hunt' ? '进山猎妖' : '入险地采药'}，${v.name}没能回来。`); }
        else v.inj = g.day + 20 + Math.random() * 40;
      }
      if (f.runs % 3 === 0) this.split(f);
    } else if (f.style === 'caravan') {
      if (roll > 0.4 * k) return;
      f.runs++;
      const profit = Math.round(50 * Math.pow(2, L.realm) * (0.7 + Math.random() * 0.8) * g.wanbao.econK);
      const got = this.earn(f.map, profit); f.purse += got; flow('caravan', got);
      [f.from, f.to] = [f.to, f.from];
      this.split(f);
    } else if (f.style === 'bandit') {
      if (roll > 0.25 * k) return;
      // 劫同一张图上的一支商队
      const prey = this.S.list.filter((x) => x.style === 'caravan' && x.map === f.map && !x.hired);
      if (!prey.length) return;
      const c = prey[Math.floor(Math.random() * prey.length)], cm = c.members.map((id) => N.byId.get(id)).filter((d): d is NpcData => !!d?.alive);
      const cp = cm.reduce((s, d) => s + Math.pow(2.2, d.realm) * (1 + d.stage * 0.2), 0);
      const win = Math.random() < power / (power + cp * 1.15);
      const loser = win ? cm : ms;
      if (loser.length) { const v = loser[Math.floor(Math.random() * loser.length)]; if (Math.random() < 0.1) g.npcs.die(v, win ? '为劫修所杀' : '劫道不成反被斩杀'); else v.inj = g.day + 30 + Math.random() * 40; }
      if (win) {
        const cl = N.byId.get(c.leader); const take = Math.round(Math.max(0, cl?.wealth ?? 0) * 0.35 + c.purse);
        if (cl) cl.wealth = Math.max(0, cl.wealth - Math.round((cl.wealth) * 0.35)); c.purse = 0; f.purse += take; f.runs++;
        this.log(`${this.name(f)}在路上劫了${this.name(c)}，抢走约 ${take} 灵石。`);
        this.split(f);
      } else if (Math.random() < 0.5) this.log(`${this.name(c)}的护卫击退了${this.name(f)}的伏击。`);
    } else if (f.style === 'mentor') {
      for (const d of ms) {
        if (d === L) continue;
        const kp = KEY_PILL[d.realm];
        if (kp && d.stage >= REALMS[d.realm].stages.length - 1 && !d.bag?.[kp] && L.wealth > 200 && Math.random() < 0.3 * k + 0.05) {
          const home = LOC_BY_ID.get(L.home); if (!home) continue;
          const W = g.wanbao, ref = W.ref(wbZoneOf(home), kp);
          if (L.wealth > ref * 1.2 && W.npcBuy(L, kp, ref * 1.6, home)) { L.bag![kp]--; if (!L.bag![kp]) delete L.bag![kp]; (d.bag ??= {})[kp] = 1; this.log(`${L.name}为徒弟${d.name}寻来一枚${itemDef(kp).name}。`); }
          else W.npcOrder(L, kp, '破境', home, Math.random);
        }
      }
    }
    // 卷款跑路：贪婪、狠辣的人看着钱袋满了
    if (f.purse > 200 && Math.random() < 0.04 * k) {
      const t = ms.find((d) => (d.pers === 'greedy' || d.pers === 'ruthless') && d.id !== f.leader);
      if (t) { t.wealth += f.purse; this.log(`${t.name}卷了${this.name(f)}的公共钱袋（${f.purse} 灵石）连夜跑了。`); f.purse = 0; f.members = f.members.filter((id) => id !== t.id); this.bind(t, null); t.grudge = (t.grudge ?? 0); }
    }
  }

  // ------------------------------------------------------------ 走在一起
  /** 找去处时：队员跟着队长（返回 true 表示已定好去处） */
  steer(d: NpcData, rnd: () => number): boolean {
    const f = this.of(d); if (!f || f.leader === d.id) return false;
    const L = this.game.npcs.byId.get(f.leader); if (!L?.alive) return false;
    const i = f.members.indexOf(d.id), an = i * 2.1 + (d.seed % 7);
    d.tx = L.tx + Math.cos(an) * (70 + i * 25); d.ty = L.ty + Math.sin(an) * (50 + i * 18); d.goal = L.goal; void rnd;
    return true;
  }
  /** 队伍在画面里的名号（NPC 名牌下多一行） */
  badge(d: NpcData): { text: string; color: string; seal: string } | null {
    const f = this.of(d); if (!f) return null;
    const s = STYLE_DEF[f.style];
    return { text: `${this.name(f)}${f.leader === d.id ? '·首' : ''}`, color: s.color, seal: s.seal };
  }

  // ------------------------------------------------------------ 你与队伍
  /** NPC 对话里的选项：攀谈、入伙、受雇护送 */
  talkOpts(d: NpcData, back: () => DNode): DOpt[] {
    const f = this.of(d); if (!f) return [];
    const g = this.game, s = STYLE_DEF[f.style], ms = f.members.map((id) => g.npcs.byId.get(id)).filter((x): x is NpcData => !!x?.alive);
    const L = g.npcs.byId.get(f.leader);
    const out: DOpt[] = [{ label: `〔${s.seal}〕问问这支${s.name}`, act: () => ({ speaker: d.name, title: this.name(f), text: `${s.desc}\n\n领头的是${L?.name ?? '？'}（${L ? realmName(L.realm, L.stage) : ''}），一行 ${ms.length} 人：${ms.map((x) => x.name).join('、')}。已${f.style === 'caravan' ? '跑了' : '做了'} ${f.runs} 趟。${f.style === 'caravan' && f.from && f.to ? `\n眼下这一趟：${LOC_BY_ID.get(f.from)?.name} → ${LOC_BY_ID.get(f.to)?.name}。` : ''}`, options: [{ label: '还有别的事', act: back }] }) }];
    if (f.style === 'bandit') return out;
    if (f.style === 'caravan' && !f.hired) {
      const pay = Math.round(60 * Math.pow(2, g.hero.realm) * (1 + ms.length * 0.2));
      out.push({ label: `受雇护送（到${LOC_BY_ID.get(f.to ?? '')?.name ?? '下一城'}，工钱 ${pay} 灵石）`, disabled: g.friends.partyFull(), hint: g.friends.partyFull() ? '同行已满' : '', act: () => this.hire(f, pay) });
    } else if (!f.joined) {
      const can = ms.length <= g.friends.partyMax() - g.npcs.followers().length && d.favor >= 10;
      out.push({ label: `入伙同行（一行 ${ms.length} 人，作风：${s.name}）`, disabled: !can, hint: !can ? (d.favor < 10 ? '还不熟（好感 10 以上）' : '同行装不下这么多人') : s.player, act: () => this.join(f) });
    }
    return out;
  }
  /** 入伙：整支队伍成了你的同行者，你的作风跟着定 */
  join(f: Fellowship): DNode | null {
    const g = this.game;
    f.joined = true;
    for (const id of f.members) { const d = g.npcs.byId.get(id); if (!d?.alive) continue; d.bond = 'companion'; d.bondUntil = g.day + 30; g.npcs.summon(id); }
    this.setMyStyle(f.style);
    audio.sfx('chime');
    g.toast(`你与${this.name(f)}结伴同行。`, 'good');
    return null;
  }
  /** 受雇护送：商队跟着你走，护到目的地城里结工钱 */
  hire(f: Fellowship, pay: number): DNode | null {
    const g = this.game;
    f.hired = { until: g.day + 40, pay };
    const lead = g.npcs.byId.get(f.leader);
    if (lead) { lead.bond = 'companion'; lead.bondUntil = g.day + 40; g.npcs.summon(lead.id); }
    this.setMyStyle('caravan');
    g.toast(`受雇护送${this.name(f)}去${LOC_BY_ID.get(f.to ?? '')?.name ?? '下一城'}：把领头的${lead?.name ?? ''}平安带到城里，工钱 ${pay} 灵石。`, 'good');
    return null;
  }
  /** 每帧（低频）：护送到了没有、入伙的散了没有 */
  tick(): void {
    const g = this.game, p = g.player;
    for (const f of this.S.list) {
      if (f.hired) {
        const lead = g.npcs.byId.get(f.leader), to = LOC_BY_ID.get(f.to ?? '');
        if (!lead?.alive) { g.toast('你护送的商队领头人陨落了，这趟护送没成。', 'warn'); f.hired = undefined; continue; }
        if (g.day > f.hired.until) { g.toast(`护送${this.name(f)}误了期限，商队自行离去。`, 'warn'); f.hired = undefined; g.friends.dismiss(lead); continue; }
        if (to && to.map === ACTIVE_MAP && Math.hypot(p.x - to.x * WORLD_SCALE, p.y - to.y * WORLD_SCALE) < 2600 && Math.hypot(lead.x - p.x, lead.y - p.y) < 1500) {
          C.addItem(g.hero, 'mat_lingshi', f.hired.pay); audio.sfx('chime');
          g.toast(`平安护送${this.name(f)}到了${to.name}，${lead.name}付了工钱 ${f.hired.pay} 灵石。`, 'good');
          this.log(`有人护着${this.name(f)}平安到了${to.name}。`);
          f.hired = undefined; f.runs++; [f.from, f.to] = [f.to, f.from];
          g.friends.dismiss(lead);
        }
      }
      if (f.joined && !f.members.some((id) => g.npcs.followers().some((a) => a.d.id === id))) { f.joined = false; f.until = g.day + 60; }
    }
  }
  /** 一支劫修团伙盯上了你：附近的队员一起扑上来（由 NPC 日常调用；返回是否动手） */
  ambush(): boolean {
    const g = this.game, p = g.player;
    // 一次只来一桩：正被追杀、在打、在天上飞（劫修埋伏在路上，截的是赶路的人）都不动手
    if (g.combat.inCombat || g.offWorld || g.inCave || g.pursuit?.cur || g.player.flying) return false;
    for (const f of this.S.list) {
      if (f.style !== 'bandit' || f.map !== ACTIVE_MAP) continue;
      const ms = f.members.map((id) => g.npcs.activeOf(id)).filter((a): a is NonNullable<typeof a> => !!a && a.d.alive && !a.enemy);
      if (ms.length < 2 || !ms.every((a) => Math.hypot(a.st.x - p.x, a.st.y - p.y) < 2600)) continue;
      const power = ms.reduce((s, a) => s + Math.pow(2.2, a.d.realm), 0), mine = Math.pow(2.2, g.hero.realm) * (1 + g.npcs.followers().length * 0.6);
      if (power < mine * 0.7) continue;
      // 恩怨重做：劫修团伙也有冷却与时限——劫过你一回（不论成败）三十日内不再围你；追杀记开始日，不再永不超时；先手记在他们身上
      if (ms.some((a) => robGuard(g, a.d))) continue;
      for (const a of ms) { a.act = 'approach'; a.d.hunting = true; a.d.huntStart = g.day; setRobCd(g, a.d, 'fail'); a.d.assail = { day: g.day, by: 'npc' }; g.rel.feud.see(a.d); }
      g.toast(`${this.name(f)}从路边围了上来！`, 'warn');
      return true;
    }
    return false;
  }

  /** 你的队伍作风对战斗与收获的加成 */
  get huntK(): number { return this.myStyle === 'hunt' && this.game.npcs.followers().length ? 1.25 : 1; }
  log10(): { day: number; text: string }[] { return this.S.log.slice(0, 10); }
}
void clamp; void ([] as LocDef[]);
