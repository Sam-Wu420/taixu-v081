// 恩怨与江湖重做 · 第三批（二）：NPC 主动找你
//
// 原来只有你去找 NPC。这一批让认识你的人按自己的心思、处境主动找上门（他走到你身边开口，走现有的对话框）：
//   · 求助（help）：他心里记着一桩仇（living 的 hate / 眼下的打算是寻仇、请人助拳），仇家比他强——请你替他出头；你真把那人除了，他欠你一份人情；
//   · 结伴（team）：好感够、脾气合得来，邀你同行一程（照 relations 的「结伴同行」）；
//   · 借钱（loan）：手头紧（储物袋里没几块灵石）的人开口借；到期连本带利来还——贪婪、狠辣的人有可能赖账（你可以当面讨）；
//   · 拜师（apprentice）：境界比你低、仰慕你的人来拜师（答应了就是你的徒弟，照 relations 的「收其为徒」）；
//   · 切磋（spar）：傲慢、正直的同辈来讨教（照 npc 的切磋）；
//   · 托付东西（entrust）：要闭关、远行的人把储物袋里的东西托你保管，到期来取——东西还在就物归原主、另有谢礼，弄丢了就结下旧怨；
//   · 报恩（repay）：借过你钱的、你替他出过头的、你在斗法里救过的，来还钱、送礼；
//   · 讨说法（grievance）：和你有旧怨（不是血仇、热度不高）的人上门来要个说法：赔礼、讲清谁先动的手、不理他、或者动手。
// 不烦人：开局五分钟内不来；两次之间要隔 25 日且 5 分钟游玩；任意 30 分钟游玩里最多来 3 次；同一个人 120 日且 30 分钟内不再来；
// 打斗、追杀、对话、御剑赶路时不来。你不在（洞府里、秘境里、异界）就留言进江湖传音，点开照样能回话。
//
// 固定种子：都在玩家侧（每帧），随机用本模块的小随机数，不动 Math.random。冷却一律「游戏天数 + 游玩时间」两个都到才解除。
import type { Game } from './game';
import type { NpcData, Active } from './npc';
import { npcMap } from './npc';
import type { DNode, DOpt } from './modal';
import { ACTIVE_MAP } from '../data/world';
import { realmName } from '../data/realms';
import { itemDef } from '../data/items';
import * as C from './cultivation';
import { audio } from './audio';
import { playOf, setFeud, markAssail, heatOf, HUNT_MIN, isMe } from './feud';

export type LfK = 'help' | 'team' | 'loan' | 'apprentice' | 'spar' | 'entrust' | 'repay' | 'reclaim' | 'grievance';
export const LF_NAME: Record<LfK, string> = { help: '求助', team: '结伴', loan: '借钱', apprentice: '拜师', spar: '切磋', entrust: '托付', repay: '报恩', reclaim: '取回托付', grievance: '讨说法' };
export interface LfMsg { id: number; npc: string; k: LfK; day: number; done?: boolean }
export interface LfSave { v: 1; seq: number; recent: number[]; nextDay?: number; nextP?: number; msgs: LfMsg[]; cur?: { id: string; k: LfK; t0: number } | null; n?: number }

/** 冷却与上限（游玩秒 / 日） */
export const LF = { first: 5 * 60, gapDays: 25, gapPlay: 5 * 60, cap: 3, win: 30 * 60, npcDays: 120, npcPlay: 30 * 60, loanDays: 40, loanPlay: 10 * 60, keepDays: 50, keepPlay: 12 * 60, msgDays: 60, walk: 25, range: 60000 };
/** 这几种在留言里也能回（隔空传音）；切磋、托付得当面 */
const REMOTE: LfK[] = ['help', 'team', 'loan', 'apprentice', 'repay', 'reclaim', 'grievance'];

let lcgS = 0x1a7f3d;
const lcg = () => { lcgS = (Math.imul(lcgS, 1664525) + 1013904223) >>> 0; return lcgS / 4294967296; };
const sum = (r: number, k = 25) => Math.round(k * Math.pow(3, Math.max(0, r - 1)));

export class Laifang {
  constructor(private readonly g: Game) {}
  get S(): LfSave { const ws = this.g.ws as { lf?: LfSave }; return (ws.lf ??= { v: 1, seq: 1, recent: [], msgs: [] }); }
  private t = 0;

  // ============================================================ 心愿：他为什么来找你
  /** 他眼下最想找你做的事（按处境、性格、和你的交情） */
  wishes(d: NpcData): [LfK, number][] {
    const g = this.g, h = g.hero, day = g.day, play = playOf(g), out: [LfK, number][] = [];
    if (d.loan && !d.loan.bad && day >= d.loan.due && play >= d.loan.dueP) out.push(['repay', 100]);
    if (d.entrust && day >= d.entrust.due && play >= d.entrust.dueP) out.push(['reclaim', 100]);
    if ((d.owe ?? 0) > 0 && !d.loan) out.push(['repay', 80]);
    if (d.grudge === 1 && heatOf(d) < HUNT_MIN && !d.hunting && d.met && d.pers !== 'ruthless') out.push(['grievance', d.pers === 'righteous' || d.pers === 'arrogant' ? 50 : 30]);
    if ((d.grudge ?? 0) > 0 || d.favor < 0) return out;
    if (d.met && d.favor >= 20 && this.foeOf(d)) out.push(['help', 45]);
    if (d.met && d.favor >= 15 && !d.loan && d.wealth < sum(d.realm, 15) && d.pers !== 'aloof') out.push(['loan', d.pers === 'greedy' ? 40 : 28]);
    const disc = g.npcs.list.filter((x) => x.bond === 'disciple' && x.alive).length;
    if (h.realm >= 2 && d.realm <= h.realm - 1 && !d.bond && disc < 3 && (d.met ? d.favor >= 30 : g.ws.rep > 30) && (d.pers === 'righteous' || d.pers === 'kind' || d.pers === 'cautious')) out.push(['apprentice', 35]);
    if (d.met && d.favor >= 30 && !d.bond && d.pers !== 'aloof' && !g.friends.partyFull() && Math.abs(d.realm - h.realm) <= 1) out.push(['team', 25]);
    if (Math.abs(d.realm - h.realm) <= 1 && (d.pers === 'arrogant' || d.pers === 'righteous') && (!d.spar || day - d.spar >= 30)) out.push(['spar', d.pers === 'arrogant' ? 30 : 18]);
    if (d.met && d.favor >= 40 && !d.entrust && (d.pers === 'cautious' || d.pers === 'kind' || d.pers === 'righteous') && this.entrustItem(d)) out.push(['entrust', 22]);
    return out;
  }
  /** 他心里那桩打不过的仇：仇家还活着、在这张图上、境界不低于他 */
  foeOf(d: NpcData): NpcData | null {
    const by = this.g.npcs.byId;
    let best: NpcData | null = null, bv = 0;
    for (const x of d.hate ?? []) { if (isMe(x.id)) continue; const o = by.get(x.id); if (!o?.alive || npcMap(o) !== npcMap(d) || o.realm < d.realm || o.bond || o.canon) continue; if (x.v > bv && x.v >= 40) { bv = x.v; best = o; } }
    if (!best && d.plan && (d.plan.k === 'seek' || d.plan.k === 'revenge') && d.plan.who) { const o = by.get(d.plan.who); if (o?.alive && o.realm >= d.realm && !o.bond && !o.canon) best = o; }
    return best;
  }
  private entrustItem(d: NpcData): string | null {
    let best: string | null = null, bp = 0;
    for (const id in d.bag ?? {}) { if ((d.bag![id] ?? 0) <= 0 || id === 'mat_lingshi') continue; const it = itemDef(id); if (it.price > bp) { bp = it.price; best = id; } }
    return best;
  }
  /** 能来找你的人 */
  private can(d: NpcData) {
    const g = this.g, play = playOf(g), p = g.player;
    if (!d.alive || d.realm < 1 || npcMap(d) !== ACTIVE_MAP || d.canon || d.beauty || d.stay || d.gz || d.orig || d.mod || d.hidden || d.zf || d.db !== undefined || d.dazi || d.hunting || d.chasing || d.wanted !== undefined) return false;
    if ((d.bond === 'companion' || d.bond === 'guard') && (d.bondUntil ?? 0) > g.day) return false;
    const a = g.npcs.activeOf(d.id); if (a && (a.enemy || a.act === 'follow' || a.duel)) return false;
    if (Math.hypot(d.x - p.x, d.y - p.y) > LF.range) return false;
    void play;
    return true;
  }
  private cooled(d: NpcData) { const g = this.g; return d.lfP === undefined || (playOf(g) - d.lfP >= LF.npcPlay && g.day - (d.lfDay ?? -1e9) >= LF.npcDays); }
  /** 挑一个人来：到期该还钱、取东西的先来；其余按心愿的轻重抽 */
  pick(): { d: NpcData; k: LfK } | null {
    const g = this.g, pool: { d: NpcData; k: LfK; w: number }[] = [];
    for (const d of g.npcs.list) {
      if (!this.can(d)) continue;
      const ws = this.wishes(d); if (!ws.length) continue;
      const due = ws.find(([k, w]) => w >= 100 && (k === 'repay' || k === 'reclaim'));
      if (!due && !this.cooled(d)) continue;
      const [k, w] = due ?? ws.reduce((m, x) => (x[1] > m[1] ? x : m));
      pool.push({ d, k, w: w * (d.met ? 1 : 0.5) });
    }
    if (!pool.length) return null;
    const top = pool.filter((x) => x.w >= 100);
    const L = top.length ? top : pool;
    let tot = 0; for (const x of L) tot += x.w;
    let r = lcg() * tot; for (const x of L) { r -= x.w; if (r <= 0) return x; }
    return L[L.length - 1];
  }
  /** 冷却、上限：两次之间 25 日 + 5 分钟；30 分钟里最多 3 次；开局 5 分钟内不来 */
  ready() {
    const g = this.g, S = this.S, play = playOf(g);
    if (play < LF.first || g.day < (S.nextDay ?? 0) || play < (S.nextP ?? 0)) return false;
    S.recent = S.recent.filter((t) => play - t < LF.win);
    return S.recent.length < LF.cap;
  }
  /** 你此刻「在」：能当面开口 */
  here() { const g = this.g; return !g.offWorld && !g.inCave && !g.hero.dead && !g.mijing?.active; }
  /** 此刻不方便（打斗、追杀、对话、赶路）：先不来 */
  busy() { const g = this.g; return !!g.modal || g.combat.inCombat || g.pursuit.active || !!g.enyuan.S.duel || g.player.flying || g.hero.realm < 1; }

  // ============================================================ 每帧
  frame(dt: number) {
    this.t -= dt; if (this.t > 0) return; this.t = 1;
    const g = this.g, S = this.S, play = playOf(g);
    if (S.cur) { this.drive(); return; }
    if (!this.ready()) return;
    const away = !this.here();
    if (!away && this.busy()) return;
    const c = this.pick(); if (!c) return;
    if (away && !REMOTE.includes(c.k)) return;
    S.nextDay = g.day + LF.gapDays; S.nextP = play + LF.gapPlay; S.recent.push(play); S.n = (S.n ?? 0) + 1;
    c.d.lfP = play; c.d.lfDay = Math.floor(g.day);
    if (away) { this.leave(c.d, c.k); return; }
    this.come(c.d, c.k);
  }
  /** 他朝你走过来 */
  come(d: NpcData, k: LfK) {
    const g = this.g, p = g.player;
    const a = g.npcs.summon(d.id); if (!a) { this.leave(d, k); return; }
    const an = lcg() * Math.PI * 2, r = 720;
    a.st.x = d.x = p.x + Math.cos(an) * r; a.st.y = d.y = p.y + Math.sin(an) * r * 0.7;
    a.act = 'walk'; a.wait = 0; a.life = undefined; d.tx = p.x; d.ty = p.y;
    a.bubble = { text: k === 'grievance' ? `苏寒！站住，我有话问你。` : k === 'repay' || k === 'reclaim' ? '苏道友，可算找着你了！' : '苏道友，请留步——', t: 3 };
    this.S.cur = { id: d.id, k, t0: playOf(g) };
    g.toast(`${d.name}朝你走来，像是有话要说。`, 'info', { lv: 'high' });
  }
  private drive() {
    const g = this.g, S = this.S, cur = S.cur!, d = g.npcs.byId.get(cur.id), p = g.player, play = playOf(g);
    if (!d?.alive) { S.cur = null; return; }
    const a = g.npcs.activeOf(d.id);
    if (!a || !this.here() || g.pursuit.active || a.enemy) { S.cur = null; this.leave(d, cur.k); return; }
    if (g.modal || g.combat.inCombat) { if (play - cur.t0 > 60) { S.cur = null; this.leave(d, cur.k); } return; }
    const dd = Math.hypot(a.st.x - p.x, a.st.y - p.y);
    if (dd > 3500) { S.cur = null; this.leave(d, cur.k); return; }
    if (dd < 280 || play - cur.t0 > LF.walk) {
      if (dd >= 280) { a.st.x = d.x = p.x + 200; a.st.y = d.y = p.y + 40; }
      a.act = 'idle'; a.wait = 5; a.st.faceToward(p.x - a.st.x, p.y - a.st.y); d.tx = d.x; d.ty = d.y;
      S.cur = null; d.met = true;
      audio.sfx('click');
      g.openDialog(this.node(d, a, cur.k, null));
      return;
    }
    d.tx = p.x; d.ty = p.y; a.act = 'walk'; a.wait = 0;
  }
  /** 你不在：留言进江湖传音 */
  leave(d: NpcData, k: LfK) {
    const g = this.g, S = this.S;
    if (!REMOTE.includes(k)) return;
    const m: LfMsg = { id: S.seq++, npc: d.id, k, day: Math.floor(g.day) };
    S.msgs.push(m); if (S.msgs.length > 12) S.msgs.splice(0, S.msgs.length - 12);
    const what: Record<LfK, string> = { help: '说有桩难事想请你出头', team: '想邀你同行一程', loan: '说手头紧，想借些灵石', apprentice: '想拜你为师', spar: '想与你切磋', entrust: '有东西想托你保管', repay: '说是来还人情的', reclaim: '来取托你保管的东西', grievance: '说要你给个说法' };
    g.enyuan.news(`${d.name}来找过你，没见着人，留了话：${what[k]}。`, { src: d, hook: { k: 'visit', ref: m.id } });
  }
  msgLive(id: number) { const g = this.g, m = this.S.msgs.find((x) => x.id === id); return !!m && !m.done && g.day - m.day < LF.msgDays && !!g.npcs.byId.get(m.npc)?.alive; }
  msgNode(id: number): DNode | null {
    if (!this.msgLive(id)) return null;
    const m = this.S.msgs.find((x) => x.id === id)!, d = this.g.npcs.byId.get(m.npc)!;
    return this.node(d, this.g.npcs.activeOf(d.id) ?? null, m.k, m);
  }

  // ============================================================ 对话
  /** 他开口（a 为空、m 不为空：传音玉简里的留言，隔空回话） */
  node(d: NpcData, a: Active | null, k: LfK, m: LfMsg | null): DNode {
    const g = this.g, h = g.hero, R = g.rel, day = g.day, play = playOf(g);
    const remote = !!m, title = `${realmName(d.realm, d.stage)} · ${LF_NAME[k]}${remote ? '（留言）' : ''}`;
    const pre = remote ? `（传音玉简里，${d.name}留了话）\n` : '';
    const close = () => { if (m) m.done = true; };
    const end = (text: string): DNode => { close(); return { speaker: d.name, title, look: a?.look, text, options: [{ label: '（别过）', act: () => null }] }; };
    const stones = C.bagCount(h, 'mat_lingshi');
    const call = d.bond === 'master' ? '徒儿' : d.bond === 'disciple' ? '师父' : d.bond === 'sworn' ? '兄弟' : '苏道友';
    const opts: DOpt[] = [];
    let text = '';
    if (k === 'help') {
      const foe = this.foeOf(d);
      if (!foe) return end(`${pre}……罢了，那件事已经过去了。`);
      const why = d.hate?.find((x) => x.id === foe.id)?.why ?? '旧怨';
      const gift = sum(d.realm, 20);
      text = `${pre}（${d.name}${remote ? '' : '拱了拱手，压低声音'}）${call}，实不相瞒——${why}。\n那${foe.name}${realmName(foe.realm, foe.stage)}，我打不过他。思来想去，相熟的人里只有你靠得住。\n若肯替我出这口气，${d.name}必有厚报。`;
      opts.push({ label: `答应替他出头（对付${foe.name}）`, tone: 'good', act: () => { d.lfHelp = foe.id; R.addFavor(d, 6); if (npcMap(foe) === ACTIVE_MAP) g.setGuide(foe.x, foe.y, `替${d.name}出头：${foe.name}`); R.log(`答应替${d.name}出头，对付${foe.name}。`, 'info'); g.enyuan.news(`${d.name}托苏寒替他出头，对付${foe.name}。`, { tone: 'mid', src: d, quiet: true }); return end(`${pre ? '' : '（他长出一口气）'}好！有你这句话，我就放心了。${foe.name}平日在这一带出没——地图上给你指了个大致方向。`); } });
      opts.push({ label: `给他些灵石疗伤（${gift}）`, disabled: stones < gift, hint: stones < gift ? '灵石不足' : '不出手，也算尽了心', act: () => { C.removeItem(h, 'mat_lingshi', gift); d.wealth += gift; R.addFavor(d, 10); d.owe = Math.max(d.owe ?? 0, 1); return end('……多谢。这份情，我记下了。'); } });
      opts.push({ label: '这是你们的事，我不便插手', act: () => { R.addFavor(d, -3); return end('（他沉默片刻，苦笑）也是。打扰了。'); } });
    } else if (k === 'team') {
      text = `${pre}${call}，这阵子一个人走，路上冷清得很。${d.pers === 'greedy' ? '听说你最近风生水起，' : ''}不如同行一程，路上也好有个照应？`;
      opts.push({ label: '好，同行一程（三十日）', tone: 'good', disabled: g.friends.partyFull(), hint: g.friends.partyFull() ? '同行者已满' : '', act: () => { d.bond = 'companion'; d.bondUntil = day + 30; g.npcs.summon(d.id); R.addFavor(d, 4); R.log(`${d.name}邀你结伴，同行三十日。`, 'good'); return end('痛快！走吧。'); } });
      opts.push({ label: '改日吧', act: () => { R.addFavor(d, -1); return end('那就改日。'); } });
    } else if (k === 'loan') {
      const amt = sum(d.realm, 25);
      text = `${pre}（${d.name}${remote ? '' : '搓着手，'}有些难为情）${call}……最近手头实在紧，${d.pers === 'greedy' ? '有一笔好买卖等着本钱' : d.inj && d.inj > day ? '受了伤，丹药钱都凑不齐' : '连买符纸的钱都凑不齐'}。能不能借我 ${amt} 灵石？${LF.loanDays} 日后连本带利还你。`;
      opts.push({ label: `借给他（${amt} 灵石）`, tone: 'good', disabled: stones < amt, hint: stones < amt ? '灵石不足' : `约 ${LF.loanDays} 日、${LF.loanPlay / 60} 分钟游玩后来还（多两成）`, act: () => { C.removeItem(h, 'mat_lingshi', amt); d.wealth += amt; d.loan = { amt, day: Math.floor(day), due: day + LF.loanDays, dueP: play + LF.loanPlay }; R.addFavor(d, 6); R.log(`借给${d.name} ${amt} 灵石。`, 'info'); return end(`${remote ? '（灵石随传讯符送了过去）' : '（他双手接过灵石）'}${call}仗义！到期一定还你。`); } });
      opts.push({ label: '拿去用，不必还了', disabled: stones < amt, act: () => { C.removeItem(h, 'mat_lingshi', amt); d.wealth += amt; R.addFavor(d, 14); d.owe = Math.max(d.owe ?? 0, 1); return end('这……这怎么好意思！这份情，我一定还。'); } });
      opts.push({ label: '我手头也紧', act: () => { R.addFavor(d, -2); return end('……那算了，是我唐突了。'); } });
    } else if (k === 'apprentice') {
      const disc = g.npcs.list.filter((x) => x.bond === 'disciple' && x.alive).length;
      text = `${pre}（${d.name}${remote ? '' : '扑通一声跪下'}）晚辈${d.name}，久仰前辈大名！${d.met ? '上回一见，晚辈回去想了许久——' : '江湖上都在传前辈的事迹，'}晚辈资质虽浅，愿拜在前辈门下，鞍前马后，绝无二心！`;
      opts.push({ label: '收他为徒', tone: 'gold', disabled: disc >= 3 || !!d.bond, hint: disc >= 3 ? '最多三名弟子' : '弟子每月孝敬，你指点他修行', act: () => { d.bond = 'disciple'; R.addFavor(d, 15); R.log(`收${d.name}为徒。`, 'good'); g.news(`苏寒收${d.name}为徒。`, 'personal'); return end(`${remote ? '（你回了一道传音）' : ''}「师父在上，受徒儿一拜！」\n\n${d.name}成了你的徒弟。`); } });
      opts.push({ label: '指点几句，不收徒', act: () => { R.addFavor(d, 4); return end('（他认认真真记下）多谢前辈指点！晚辈不会放弃的。'); } });
      opts.push({ label: '我不收徒', act: () => { R.addFavor(d, -4); return end('……是晚辈唐突了。'); } });
    } else if (k === 'spar') {
      text = `${d.pers === 'arrogant' ? `（${d.name}抱着胳膊上下打量你）听说你最近名头不小。来，过两招，让我看看是真是假。` : `${call}，近来修行遇了瓶颈，想找个对手印证一番——点到为止，如何？`}`;
      if (a) opts.push({ label: '请！（切磋，点到为止）', tone: 'good', act: () => { a.bubble = { text: '请！', t: 2 }; d.spar = day; g.npcs.toEnemy(a, true, true); g.toast(`与${d.name}切磋，点到为止。`); return null; } });
      opts.push({ label: '今日不便', act: () => { R.addFavor(d, d.pers === 'arrogant' ? -4 : -1); return end(d.pers === 'arrogant' ? '哼，怕了就直说。' : '那就改日。'); } });
    } else if (k === 'entrust') {
      const it = this.entrustItem(d);
      if (!it) return end('……没事了。');
      const name = itemDef(it).name;
      text = `${pre}${call}，我要${d.pers === 'cautious' ? '闭一阵死关' : '出一趟远门'}，身上这件${name}带着不放心，放在洞府里又怕遭贼——想托你替我保管些时日。${LF.keepDays} 日后我来取。`;
      opts.push({ label: `替他保管（${name}）`, tone: 'good', act: () => { C.addItem(h, it, 1); d.bag![it] = (d.bag![it] ?? 1) - 1; if (d.bag![it] <= 0) delete d.bag![it]; d.entrust = { item: it, n: 1, due: day + LF.keepDays, dueP: play + LF.keepPlay }; R.addFavor(d, 6); R.log(`${d.name}把${name}托你保管。`, 'info'); return end(`（他把${name}郑重交到你手上）有劳了。${LF.keepDays} 日后见。\n\n（东西要留着——卖了、用了，到时候拿不出来，他会记恨）`); } });
      opts.push({ label: '不便代管', act: () => { R.addFavor(d, -1); return end('也是，这种事本就为难人。'); } });
    } else if (k === 'repay') {
      if (d.loan) {
        const back = Math.round(d.loan.amt * 1.2);
        text = `${pre}${call}，上回借你的 ${d.loan.amt} 灵石，连本带利 ${back}，${remote ? '随传讯符送来了' : '如数奉还'}。那次多亏了你。`;
        opts.push({ label: `收下（${back} 灵石）`, tone: 'good', act: () => { C.addItem(h, 'mat_lingshi', back); d.wealth = Math.max(0, d.wealth - back); d.loan = undefined; R.addFavor(d, 6); R.log(`${d.name}连本带利还了 ${back} 灵石。`, 'good'); return end('以后有用得着我的地方，尽管开口。'); } });
        opts.push({ label: '利钱就免了，本钱收下', act: () => { const b = d.loan!.amt; C.addItem(h, 'mat_lingshi', b); d.wealth = Math.max(0, d.wealth - b); d.loan = undefined; R.addFavor(d, 10); return end('……你这人，够意思！'); } });
      } else {
        const big = (d.owe ?? 1) >= 2, gift = sum(d.realm, big ? 60 : 30), it = this.entrustItem(d);
        text = `${pre}${call}！${big ? '你替我出了那口恶气，' : '上回那份情，'}我一直记着。${it && big ? `这件${itemDef(it).name}，` : `这 ${gift} 灵石，`}是一点心意，务必收下。`;
        opts.push({ label: '收下', tone: 'good', act: () => { if (it && big) { C.addItem(h, it, 1); d.bag![it] -= 1; if (d.bag![it] <= 0) delete d.bag![it]; } else { C.addItem(h, 'mat_lingshi', gift); d.wealth = Math.max(0, d.wealth - gift); } d.owe = undefined; R.addFavor(d, 8); R.log(`${d.name}登门致谢，送来谢礼。`, 'good'); return end('收下就好，收下就好。'); } });
        opts.push({ label: '举手之劳，不必客气', act: () => { d.owe = undefined; R.addFavor(d, 14); return end('（他愣了愣，郑重一揖）你这个朋友，我交定了。'); } });
      }
    } else if (k === 'reclaim') {
      const e = d.entrust; if (!e) return end('……没事了。');
      const name = itemDef(e.item).name, has = C.bagCount(h, e.item) >= e.n, thanks = sum(d.realm, 40);
      text = `${pre}${call}，${LF.keepDays} 日之约到了——我来取那件${name}。`;
      opts.push({ label: `物归原主（${name}）`, tone: 'good', disabled: !has, hint: has ? `他另有谢礼（${thanks} 灵石）` : '东西已经不在你身上了', act: () => { C.removeItem(h, e.item, e.n); (d.bag ??= {})[e.item] = (d.bag[e.item] ?? 0) + e.n; C.addItem(h, 'mat_lingshi', thanks); d.entrust = undefined; R.addFavor(d, 18); R.log(`把${name}原样还给了${d.name}。`, 'good'); g.enyuan.news(`${d.name}逢人便说：苏寒替他保管${name}，分毫未动。`, { tone: 'good', src: d }); return end(`${remote ? '（东西随传讯符送了回去）' : '（他接过来仔细看了看，笑了）'}分毫未动——没看错人。这些灵石是谢礼。`); } });
      opts.push({ label: '东西……不见了', tone: 'bad', act: () => { d.entrust = undefined; R.addFavor(d, -40); setFeud(d, { grudge: 1, heat: 20, by: 'hero', day, why: `吞了他托付的${name}` }); R.log(`${d.name}托你保管的${name}没了，他记恨上了你。`, 'bad'); g.enyuan.news(`${d.name}托苏寒保管的${name}没了下落，两人闹翻了。`, { tone: 'bad', src: d }); return end(`不见了？！好……好一个「不见了」。苏寒，这笔账我记下了。`); } });
    } else {
      const cost = R.parleyCost(d), byNpc = d.feudBy === 'npc' || d.assail?.by === 'npc';
      text = `${pre}（${d.name}${remote ? '' : '站定了，没有拔剑'}）${d.why ? d.why + '——' : ''}今日我来，不是要动手，是要你给个说法。`;
      opts.push({ label: `赔礼（灵石 ${cost}）`, tone: 'good', disabled: stones < cost, hint: stones < cost ? '灵石不足' : '旧怨了结', act: () => { C.removeItem(h, 'mat_lingshi', cost); d.wealth += cost; d.grudge = 0; d.why = undefined; d.heat = 0; R.setFavor(d, Math.max(d.favor, 0)); R.log(`向${d.name}赔礼，旧怨了结。`, 'good'); return end('……行。这事就算翻篇了。'); } });
      opts.push({ label: '把话说清楚：是他那边先动的手', disabled: !byNpc, hint: byNpc ? '讲理的人听得进去' : '这件事是你先动的手', act: () => {
        if (d.pers === 'righteous' || d.pers === 'kind' || d.pers === 'cautious') { d.grudge = 0; d.why = undefined; d.heat = 0; R.setFavor(d, Math.max(d.favor, 5)); R.log(`和${d.name}把话说开了，旧怨了结。`, 'good'); return end('（他沉默良久）……我去打听过了，你说的是实话。是我错怪你了。'); }
        R.addFavor(d, -5); return end('强词夺理！'); } });
      opts.push({ label: '无话可说', act: () => { d.heat = Math.min(100, heatOf(d) + 12); R.addFavor(d, -5); if (a) a.bubble = { text: '好，你等着。', t: 2.5 }; return end('（他冷笑一声，转身走了）'); } });
      if (a) opts.push({ label: '动手（你先动的手）', tone: 'bad', act: () => { close(); markAssail(d, 'hero', day); g.rel.feud.see(d); a.bubble = { text: '好！那就手底下见真章！', t: 2.5 }; g.npcs.toEnemy(a, true); return null; } });
    }
    return { speaker: d.name, title, look: a?.look, text, options: opts, mood: k === 'grievance' ? 'danger' : 'normal' };
  }

  // ============================================================ 你去找他：讨还借款、还托付的东西
  talkOpts(a: Active, title: string, back: () => DNode): DOpt[] {
    const g = this.g, d = a.d, h = g.hero, R = g.rel, out: DOpt[] = [];
    const end = (text: string): DNode => ({ speaker: d.name, title, look: a.look, text, options: [{ label: '还有别的事', act: back }, { label: '告辞', act: () => null }] });
    if (d.loan && (d.loan.bad || g.day >= d.loan.due)) out.push({ label: `讨还借款（${d.loan.amt} 灵石）`, tone: 'gold', act: () => {
      const L = d.loan!;
      if ((d.pers === 'greedy' || d.pers === 'ruthless') && d.favor < 20 && L.bad) { R.addFavor(d, -10); L.bad = false; L.due = g.day + 20; L.dueP = playOf(g) + 5 * 60; return end('（他眼神闪躲）急什么！过些日子，过些日子一定还。'); }
      C.addItem(h, 'mat_lingshi', L.amt); d.wealth = Math.max(0, d.wealth - L.amt); d.loan = undefined; R.addFavor(d, -2);
      return end('（他磨磨蹭蹭地掏出灵石）给你，给你……一分不少。');
    } });
    if (d.entrust && C.bagCount(h, d.entrust.item) >= d.entrust.n) out.push({ label: `提前把${itemDef(d.entrust.item).name}还给他`, act: () => {
      const e = d.entrust!; C.removeItem(h, e.item, e.n); (d.bag ??= {})[e.item] = (d.bag[e.item] ?? 0) + e.n; d.entrust = undefined; R.addFavor(d, 10);
      return end('提前送回来了？有心了。');
    } });
    return out;
  }
  /** 你杀了 k（enyuan.onHeroKill 调）：答应替谁出头的，那人欠你一份大人情（日后来报恩） */
  onHeroKill(k: NpcData) {
    const g = this.g;
    for (const d of g.npcs.list) {
      if (!d.alive || d.lfHelp !== k.id) continue;
      d.lfHelp = undefined; d.owe = 2; g.rel.addFavor(d, 20);
      d.lfP = undefined;   // 报恩不必等那一百二十日
      g.rel.log(`你替${d.name}除了${k.name}。他欠你一份大人情。`, 'good');
      g.enyuan.news(`${d.name}逢人便说：苏寒替他除了${k.name}，此恩没齿难忘。`, { tone: 'good', src: d });
    }
  }
  /** 到期不还的：贪婪、狠辣的人有可能赖账（玩家侧日结里查） */
  daily() {
    const g = this.g, play = playOf(g);
    for (const d of g.npcs.list) {
      const L = d.loan; if (!L || L.bad || L.chk || !d.alive || g.day < L.due || play < L.dueP) continue;
      L.chk = true;   // 只掷一次：到期那一刻定下赖不赖
      if ((d.pers === 'greedy' || d.pers === 'ruthless') && d.favor < 40 && lcg() < 0.35) {
        L.bad = true;
        g.enyuan.news(`${d.name}借了苏寒 ${L.amt} 灵石，到期却躲着不见人。`, { tone: 'bad', src: d });
        g.rel.log(`${d.name}借你的 ${L.amt} 灵石到期没还。当面找他讨。`, 'bad');
      }
    }
  }
}
