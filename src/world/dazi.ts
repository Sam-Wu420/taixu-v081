// 恩怨与江湖重做 · 第三批（三）：搭档
//
// 伴侣、义兄弟、师徒可以设成「固定搭档」（同时只有一位）：
//   · 跟着你：不像结伴同行那样三十日就走，一直跟着（relations.update 照同行者的写法 summon），战斗里配合，第二批的队伍指令照常下；
//   · 底线（qualm，enyuan.qualm 先问这里）：按他的脾气能忍几回「太狠」（杀凡人、杀求饶的人、说好别杀的人、无故杀人、夺人宝物）：
//     忍到头先劝你（对话框，你可以认错或顶回去）；再犯就离开你（搭档解除，交情还在，但好感大跌、一阵子不肯再做你的搭档）；
//     离开过一回又犯、或者正直温和的人看你杀凡人杀求饶的——反目成仇：断了伴侣 / 结义 / 师徒，结下血仇，进恩怨页，先手算你；
//   · 主动提议（propose）：隔一阵他会提一件事（拿通缉犯、那桩夺宝的事、风声紧回宗门避避、去哪猎妖探洞府、去坊市看看悬赏），
//     看他的脾气挑；头上冒一句、江湖传音里记一条，点开是对话：依他、改日、以后少提。队伍框上点他也能问。
// 入口：和他交谈（「请他做固定搭档」）、队伍框（点他的卡片）、人脉录「恩怨」页的搭档栏。不新增按键。
//
// 固定种子：都在玩家侧，随机用本模块的小随机数；冷却「游戏天数 + 游玩时间」。
import type { Game } from './game';
import type { NpcData, Active, Pers } from './npc';
import { npcMap } from './npc';
import type { DNode, DOpt } from './modal';
import { LOCATIONS, ACTIVE_MAP, WORLD_SCALE, type LocDef } from '../data/world';
import { realmName } from '../data/realms';
import { dirName } from './sites';
import { audio } from './audio';
import { playOf, setFeud, markAssail, marksOf, cn } from './feud';

export interface DzProp { k: 'wanted' | 'duobao' | 'cool' | 'hunt' | 'town' | 'secret'; text: string; x?: number; y?: number; name?: string; day: number; p: number; done?: boolean }
export interface DzSave { v: 1; id?: string; propDay?: number; propP?: number; prop?: DzProp | null; quiet?: boolean }

/** 各种脾气能忍几回「太狠」 */
export const DZ_LIMIT: Record<Pers, number> = { righteous: 2, kind: 2, cautious: 3, aloof: 4, arrogant: 4, greedy: 5, ruthless: 8 };
/** 主动提议的间隔（日 + 游玩秒；你说「以后少提」就翻倍）；离开你以后多久不肯再做搭档 */
export const DZ = { propDays: 30, propPlay: 5 * 60, backDays: 120, backPlay: 20 * 60 };

const ta = (d: NpcData) => (d.sex === 'f' ? '她' : '他');
let lcgS = 0x3d2a91;
const lcg = () => { lcgS = (Math.imul(lcgS, 1664525) + 1013904223) >>> 0; return lcgS / 4294967296; };

export class Dazi {
  constructor(private readonly g: Game) {}
  get S(): DzSave { const ws = this.g.ws as { dz?: DzSave }; return (ws.dz ??= { v: 1 }); }
  private t = 0;
  /** 当前搭档 */
  cur(): NpcData | null { const id = this.S.id; const d = id ? this.g.npcs.byId.get(id) : undefined; return d?.alive && d.dazi ? d : null; }
  /** 能不能跟着（秘境、异界里不跟） */
  canFollow() { const g = this.g; return !g.offWorld; }
  /** 和你是什么关系（能做搭档的才有） */
  tie(d: NpcData): string | null {
    if (!d.alive) return null;
    if (d.bond === 'sworn') return d.sex === 'f' ? '义姐' : '义兄';
    if (d.bond === 'master') return '师父';
    if (d.bond === 'disciple') return '徒弟';
    if (d.beauty && (this.g.ws.hearts?.[d.beauty] as { flags?: { companion?: boolean } } | undefined)?.flags?.companion) return '伴侣';
    return null;
  }
  /** 能不能请他做搭档；不能的话为什么 */
  why(d: NpcData): string {
    const g = this.g;
    if (!this.tie(d)) return '只有伴侣、义兄弟、师徒能做固定搭档';
    if (d.dazi) return '已经是你的搭档';
    if (d.dzLeft !== undefined && (g.day - d.dzLeft < DZ.backDays || playOf(g) < (d.dzBackP ?? 0))) return `${ta(d)}离开你没多久，还不肯回来`;
    if (d.favor < 20) return '交情还不够';
    return '';
  }
  set(d: NpcData) {
    const g = this.g, S = this.S;
    if (this.why(d)) return false;
    const old = this.cur(); if (old && old !== d) this.unset(old, '');
    d.dazi = true; d.dzQ = 0; d.dzW = undefined; S.id = d.id;
    S.propDay = g.day + 6; S.propP = playOf(g) + 90;
    const a = g.npcs.summon(d.id); if (a) a.bubble = { text: d.bond === 'master' ? '也好，为师陪你走一程。' : d.bond === 'disciple' ? '师父去哪，徒儿就去哪！' : '往后你我同进同退！', t: 3 };
    g.rel.log(`${this.tie(d)}${d.name}做了你的固定搭档。`, 'good');
    g.toast(`${this.tie(d)}${d.name}成了你的固定搭档：一直跟着你，战斗里听你的指令。`, 'good');
    return true;
  }
  unset(d: NpcData, why = '你请他先回去') {
    const g = this.g, S = this.S;
    d.dazi = undefined; d.dzQ = 0; d.dzW = undefined; d.order = undefined; d.spareId = undefined;
    if (S.id === d.id) { S.id = undefined; S.prop = null; }
    if (g.npcs.activeOf(d.id)?.act === 'follow') g.npcs.dismiss(d.id);
    if (why) g.rel.log(`${d.name}不再做你的搭档（${why}）。`, 'info');
  }

  // ============================================================ 底线
  /** 你下手太狠（enyuan.qualm 先问这里）：是搭档就按搭档的规矩来，返回 true */
  qualm(a: Active, v: number, why: string): boolean {
    const g = this.g, d = a.d; if (!d.dazi || this.S.id !== d.id) return false;
    const lim = DZ_LIMIT[d.pers] ?? 3;
    d.dzQ = (d.dzQ ?? 0) + v;
    if (d.dzQ < lim) return true;
    const severe = v >= 2 && (d.pers === 'righteous' || d.pers === 'kind');
    if (!d.dzW) { d.dzW = 1; d.dzQ = lim - 1; this.say(this.warnNode(d, a, why)); return true; }
    if (d.dzLeft !== undefined || severe || d.dzW >= 2) { this.turn(d, a, why); return true; }
    this.leaveYou(d, a, why);
    return true;
  }
  /** 你夺人宝物、对无辜的人动手（duobao 调）：正直、温和的搭档也记一笔 */
  onDeed(v: number, why: string) {
    const d = this.cur(); if (!d) return;
    if (!(d.pers === 'righteous' || d.pers === 'kind' || d.pers === 'cautious')) return;
    const a = this.g.npcs.activeOf(d.id); if (a?.act === 'follow') this.qualm(a, v, why);
  }
  /** 战斗里不弹对话框：先冒一句，打完再说 */
  private pending: (() => DNode) | null = null;
  private say(f: () => DNode) { const g = this.g; if (g.modal || g.combat.inCombat) this.pending = f; else g.openDialog(f()); }
  private warnNode(d: NpcData, a: Active, why: string): () => DNode {
    const g = this.g, call = this.call(d);
    a.bubble = { text: `${call}，收手吧！`, t: 3.5 };
    g.toast(`搭档${d.name}劝你：${why}，下手太狠了。`, 'warn');
    g.rel.log(`搭档${d.name}劝你收手（${why}）。`, 'bad');
    return () => ({
      speaker: d.name, title: `${this.tie(d)} · 劝`, look: a.look, mood: 'danger',
      text: `（${d.name}拦在你面前，脸色很难看）${call}，${why}……\n${d.pers === 'righteous' ? '修仙修的是心。这样下去，你和那些魔头有什么两样？' : d.pers === 'kind' ? '我知道你有你的难处，可……别再这样了，好么？' : d.pers === 'cautious' ? '杀孽太重，迟早招来报应，我们也走不远。' : '我不是不讲情面的人，但这种事，再有一回，我就不跟了。'}\n\n（再犯，${d.name}就会离开你${d.pers === 'righteous' || d.pers === 'kind' ? '——${ta(d)}这种脾气，看你杀凡人、杀求饶的人，会与你反目成仇' : ''}）`,
      options: [
        { label: '你说得对，是我过了', tone: 'good', act: () => { d.dzQ = Math.max(0, (DZ_LIMIT[d.pers] ?? 3) - 2); g.rel.addFavor(d, 3); return { speaker: d.name, look: a.look, text: '（他松了口气）……知道就好。走吧。', options: [{ label: '（走）', act: () => null }] }; } },
        { label: '少管我', tone: 'bad', act: () => { g.rel.addFavor(d, -6); d.dzW = 2; return { speaker: d.name, look: a.look, text: '（他盯着你看了很久，什么也没说）', options: [{ label: '（走）', act: () => null }] }; } },
      ],
    });
  }
  /** 再犯：离开你（搭档解除，交情还在） */
  private leaveYou(d: NpcData, a: Active, why: string) {
    const g = this.g, call = this.call(d);
    a.bubble = { text: '道不同，不相为谋。', t: 4 };
    this.unset(d, why); d.dzLeft = Math.floor(g.day); d.dzBackP = playOf(g) + DZ.backPlay;
    g.rel.addFavor(d, -30);
    g.toast(`${this.tie(d)}${d.name}看不下去，离你而去。`, 'warn', { lv: 'high' });
    g.enyuan.news(`${d.name}与苏寒分道扬镳，据说是看不惯他下手太狠。`, { tone: 'bad', src: d });
    this.say(() => ({ speaker: d.name, title: `${this.tie(d) ?? ''} · 离去`, look: a.look, mood: 'danger', text: `${call}，${why}……我劝过你了。\n这一程，我不陪你走了。你好自为之。\n\n（${d.name}不再做你的搭档。${d.bond ? `${this.tie(d)}的名分还在，` : ''}过一阵子气消了，或许还能再请${ta(d)}回来）`, options: [{ label: `（目送${ta(d)}离去）`, act: () => null }] }));
  }
  /** 反目成仇：断了名分，结下血仇，先手算你 */
  private turn(d: NpcData, a: Active, why: string) {
    const g = this.g, tie = this.tie(d) ?? '搭档', day = g.day;
    a.bubble = { text: '从今往后，你我恩断义绝！', t: 4 };
    this.unset(d, why); d.dzLeft = Math.floor(day); d.dzBackP = playOf(g) + DZ.backPlay * 3;
    d.bond = undefined; g.rel.setFavor(d, -80);
    setFeud(d, { grudge: 2, heat: 50, by: 'hero', day, why: `${why}——${d.name}与你割席断义，反目成仇` });
    markAssail(d, 'hero', day); g.rel.feud.see(d);
    g.toast(`${tie}${d.name}与你反目成仇！（进了恩怨页：先手算你）`, 'warn', { lv: 'urgent' });
    g.rel.log(`${tie}${d.name}因你${why}，与你反目成仇。`, 'bad');
    g.enyuan.news(`${d.name}与${tie === '伴侣' ? '伴侣' : ''}苏寒反目成仇：「此人${why}，我${d.name}羞与为伍！」`, { tone: 'bad', src: d });
    audio.sfx('thunder');
    this.say(() => ({ speaker: d.name, title: `${tie} · 反目`, look: a.look, mood: 'danger', text: `（${d.name}${d.bond === undefined ? '割下一角衣袍，掷在地上' : ''}）${why}——我劝过你，你不听；我走了，你还是这样。\n${tie === '徒弟' ? '这个师父，我不认了！' : tie === '师父' ? '我没有你这样的徒弟！' : '从今往后，你我恩断义绝！'}再见面时，休怪我剑下无情。\n\n（${d.name}与你结下血仇。这段仇是你先手结下的）`, options: [{ label: '（……）', act: () => null }] }));
  }
  private call(d: NpcData) { return d.bond === 'master' ? '徒儿' : d.bond === 'disciple' ? '师父' : d.bond === 'sworn' ? (d.sex === 'f' ? '弟弟' : '兄弟') : '你'; }

  // ============================================================ 每帧：跟随、提议
  frame(dt: number) {
    this.t -= dt; if (this.t > 0) return; this.t = 1;
    const g = this.g, S = this.S, d = this.cur();
    if (this.pending && !g.modal && !g.combat.inCombat) { const f = this.pending; this.pending = null; g.openDialog(f()); return; }
    if (!d) { if (S.id) { const o = g.npcs.byId.get(S.id); if (!o?.alive) { S.id = undefined; S.prop = null; } } return; }
    if (g.offWorld || g.inCave || g.hero.dead) return;
    // 伴侣（知交）没有 bond，relations.update 不管她：这里替她跟上
    if (d.beauty && g.npcs.activeOf(d.id)?.act !== 'follow') g.npcs.summon(d.id);
    if (S.prop && !S.prop.done && g.day - S.prop.day > 40) S.prop = null;
    const play = playOf(g);
    if (g.day < (S.propDay ?? 0) || play < (S.propP ?? 0) || g.modal || g.combat.inCombat || g.pursuit.active) return;
    const mul = S.quiet ? 2 : 1;
    S.propDay = g.day + DZ.propDays * mul; S.propP = play + DZ.propPlay * mul;
    this.propose();
  }
  /** 搭档提议去哪、做什么：看他的脾气挑 */
  propose(): DzProp | null {
    const g = this.g, S = this.S, d = this.cur(); if (!d) return null;
    const p = g.player, day = g.day, play = playOf(g), cand: [DzProp, number][] = [];
    const W: Record<Pers, Partial<Record<DzProp['k'], number>>> = {
      righteous: { wanted: 4, hunt: 2, town: 1 }, kind: { town: 3, cool: 2, wanted: 2 }, cautious: { cool: 4, town: 2, secret: 1 },
      aloof: { secret: 3, hunt: 1 }, arrogant: { hunt: 4, wanted: 2, duobao: 1 }, greedy: { duobao: 4, secret: 3, town: 1 }, ruthless: { duobao: 3, hunt: 3, wanted: 1 },
    };
    const w = W[d.pers] ?? {};
    const near = (t: LocDef['type'], minor?: boolean) => LOCATIONS.filter((l) => l.map === ACTIVE_MAP && l.type === t && (minor === undefined || !!l.minor === minor)).map((l) => ({ l, dd: Math.hypot(l.x * WORLD_SCALE - p.x, l.y * WORLD_SCALE - p.y) })).filter((x) => x.dd > 3000).sort((a, b) => a.dd - b.dd)[0];
    const where = (x: number, y: number) => `${dirName(x - p.x, y - p.y)}边${cn(Math.max(1, Math.round(Math.hypot(x - p.x, y - p.y) / 5400)))}里外`;
    const rep = g.enyuan.S.reports.find((r) => r.status === 'open' && g.npcs.byId.get(r.npcId)?.alive && npcMap(g.npcs.byId.get(r.npcId)!) === ACTIVE_MAP);
    if (rep) { const c = g.npcs.byId.get(rep.npcId)!; cand.push([{ k: 'wanted', text: `${rep.whereName}贴着${c.name}的通缉，人就在${where(c.x, c.y)}。咱们去把他拿了，赏钱一人一半！`, x: c.x, y: c.y, name: `通缉：${c.name}`, day, p: play }, w.wanted ?? 1]); }
    const job = g.duobao.S.job;
    if (job && (job.ph === 'lead' || job.ph === 'scout')) cand.push([{ k: 'duobao', text: `${job.place}那桩事你听说了吧？${job.itemName}——这种机缘，错过了就没了。要不要先去踩踩点？`, x: job.x, y: job.y, name: `夺宝：${job.place}`, day, p: play }, w.duobao ?? 0.5]);
    if (marksOf(g.rel.feud.rows()[0]?.heat ?? 0) >= 2) { const s = g.ws.sect, home = g.ws.home; const L = s ? LOCATIONS.find((l) => l.id === s.id && l.map === ACTIVE_MAP) : undefined; const tx = L ? L.x * WORLD_SCALE : home?.map === ACTIVE_MAP ? home.x : undefined, ty = L ? L.y * WORLD_SCALE : home?.y; if (tx !== undefined && ty !== undefined) cand.push([{ k: 'cool', text: `外头风声紧，${L ? `回${L.name}闭关` : '回洞府'}避一避吧，等热度散了再出来。`, x: tx, y: ty, name: L ? L.name : '洞府', day, p: play }, (w.cool ?? 0.5) * 2]); }
    const dg = near('danger'); if (dg) cand.push([{ k: 'hunt', text: `${dg.l.name}妖兽多，在${where(dg.l.x * WORLD_SCALE, dg.l.y * WORLD_SCALE)}。去猎几头，换些材料，也练练手。`, x: dg.l.x * WORLD_SCALE, y: dg.l.y * WORLD_SCALE, name: dg.l.name, day, p: play }, w.hunt ?? 0.5]);
    const tw = near('city') ?? near('town', false); if (tw) cand.push([{ k: 'town', text: `去${tw.l.name}坊市转转吧——看看悬赏榜，补些丹药符箓。`, x: tw.l.x * WORLD_SCALE, y: tw.l.y * WORLD_SCALE, name: tw.l.name, day, p: play }, w.town ?? 0.5]);
    const sc = near('secret'); if (sc) cand.push([{ k: 'secret', text: `听说${sc.l.name}（${where(sc.l.x * WORLD_SCALE, sc.l.y * WORLD_SCALE)}）有前人留下的洞府，禁制残存，或有遗宝。去探一探？`, x: sc.l.x * WORLD_SCALE, y: sc.l.y * WORLD_SCALE, name: sc.l.name, day, p: play }, w.secret ?? 0.5]);
    if (!cand.length) return null;
    let tot = 0; for (const [, x] of cand) tot += x;
    let r = lcg() * tot, pick = cand[0][0];
    for (const [c, x] of cand) { r -= x; if (r <= 0) { pick = c; break; } }
    S.prop = pick;
    const a = g.npcs.activeOf(d.id); if (a) a.bubble = { text: pick.text.length > 22 ? pick.text.slice(0, 21) + '……' : pick.text, t: 4 };
    g.enyuan.news(`搭档${d.name}提议：${pick.text}`, { src: d, hook: { k: 'dazi' } });
    g.toast(`搭档${d.name}有个提议（点队伍框里的他，或江湖传音里看）。`, 'info', { lv: 'low' });
    return pick;
  }
  propLive() { const P = this.S.prop; return !!P && !P.done && !!this.cur(); }
  propNode(): DNode | null {
    const g = this.g, S = this.S, d = this.cur(), P = S.prop; if (!d) return null;
    const a = g.npcs.activeOf(d.id);
    if (!P || P.done) return { speaker: d.name, title: `${this.tie(d)} · 搭档`, look: a?.look, text: this.idle(d), options: [{ label: '问问他想去哪', act: () => { const n = this.propose(); return n ? this.propNode() : { speaker: d.name, look: a?.look, text: '眼下没什么想去的地方，听你的。', options: [{ label: '好', act: () => null }] }; } }, { label: '没事', act: () => null }] };
    const opts: DOpt[] = [
      { label: '依你，走', tone: 'good', act: () => { P.done = true; if (P.x !== undefined && P.y !== undefined) g.setGuide(P.x, P.y, P.name ?? '搭档的提议'); g.rel.addFavor(d, 2); if (a) a.bubble = { text: '走！', t: 2 }; return null; } },
      { label: '改日再说', act: () => { P.done = true; return null; } },
      { label: '以后少提这些', act: () => { P.done = true; S.quiet = true; g.rel.addFavor(d, -2); return { speaker: d.name, look: a?.look, text: '……知道了。', options: [{ label: '（走）', act: () => null }] }; } },
    ];
    return { speaker: d.name, title: `${this.tie(d)} · 提议`, look: a?.look, text: P.text, options: opts };
  }
  private idle(d: NpcData) { return d.pers === 'righteous' ? '路见不平，咱们就管一管。' : d.pers === 'greedy' ? '有好处的地方，叫上我。' : d.pers === 'cautious' ? '小心些，总没错。' : d.pers === 'arrogant' ? '有什么难缠的对手？带我去会会。' : '你去哪，我就去哪。'; }

  // ============================================================ 入口
  /** 交谈里：请他做固定搭档 / 不做了 / 问问他的打算 */
  talkOpts(a: Active, title: string, back: () => DNode): DOpt[] {
    const d = a.d, out: DOpt[] = [], tie = this.tie(d); if (!tie) return out;
    if (d.dazi) {
      out.push({ label: '问问搭档的打算', act: () => this.propNode() });
      out.push({ label: '请他先回去（解除搭档）', act: () => { this.unset(d); return { speaker: d.name, title, look: a.look, text: '也好。有事传音给我。', options: [{ label: '还有别的事', act: back }, { label: '告辞', act: () => null }] }; } });
      return out;
    }
    const why = this.why(d);
    out.push({ label: `请${tie}做固定搭档`, tone: 'gold', disabled: !!why, hint: why || `一直跟着你、战斗里听指令；${d.name}有自己的底线（${DZ_LIMIT[d.pers]} 回「太狠」就劝你）`, act: () => { this.set(d); return { speaker: d.name, title, look: a.look, text: d.bond === 'master' ? '（师父看了你一眼）也好。只是记着——为师眼里揉不得沙子。' : d.bond === 'disciple' ? '徒儿一定好好跟着师父！' : '好！往后你我同进同退。只一条：别做亏心事。', options: [{ label: '还有别的事', act: back }, { label: '告辞', act: () => null }] }; } });
    return out;
  }
  /** 恩怨页、队伍框：能做搭档的人 */
  candidates(): NpcData[] { return this.g.npcs.list.filter((d) => d.alive && !!this.tie(d)); }
  realmText(d: NpcData) { return realmName(d.realm, d.stage); }
}
