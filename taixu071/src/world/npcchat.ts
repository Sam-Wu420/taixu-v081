// 太虚问道录 · NPC 自由对话（v0.57 重写）：玩家当面打字，人物以自己的身份、性情、见识和与你的过往作答。
// 前端负责「把这个人和此刻的世界讲清楚」：人物卡（身份、境界、门派、性情、家底、人脉、经历、口吻样例）、
// 玩家卡（境界、宗门、名声、身家、所在、近来大事）、两人的过往（好感、恩怨、交谈记忆）；
// 后端（创空间的 /api/npc/chat）只产出台词与情绪信号，数值由这里按性情夹紧后结算。
// 没有后端（双击 index.html 的本地版）时整个功能不显示。
import type { Game } from './game';
import type { NpcData, Pers } from './npc';
import { PERS_NAME } from './npc';
import { realmName, REALMS, ROOTS } from '../data/realms';
import { LOC_BY_ID, MAP_NAME, ACTIVE_MAP, ACTIVE_WORLD, WORLD_SCALE } from '../data/world';
import { worldCurrencyId, worldCurrencyName } from '../data/worldHierarchy';
import { BEAUTY_BY_ID } from '../data/beauties';
import { itemDef } from '../data/items';
import { ARTS } from '../data/arts';
import { GONGFA } from '../data/skills';
import { WEATHER_NAME } from './weather';
import { repName, SECT_RANKS } from './worldstate';
import type { Shop } from './modal';
import * as C from './cultivation';

export type ChatTarget =
  | { kind: 'npc'; id: string }          // 众生名册里的人（含原著人物、模组 NPC）
  | { kind: 'beauty'; id: string }       // 红颜（BEAUTY_BY_ID 的 id）
  | { kind: 'keeper'; shop: Shop };      // 坊市掌柜

export interface ChatTurn { w: 'p' | 'n'; t: string; act?: string; tone?: string }
interface Memory { log: ChatTurn[]; notes: string[]; n: number; favDay?: number; favToday?: number; deal?: { day: number; tries: number; price: number } }
export interface ChatResult { ok: boolean; say: string; act?: string; tone: string; delta: number; bargain?: string; price?: number; note?: string; end?: boolean; fallback?: boolean }

const API = './api/npc/chat';
const FACTION: Record<string, string> = { sect: '宗门弟子', rogue: '散修', demon: '魔道中人', mortal: '凡人', merchant: '行商' };
const ROLE: Record<string, string> = { cultivator: '修士', scholar: '书生', farmer: '农夫', merchant: '商人', female: '女子', elder: '老者', guard: '护卫', monk: '僧人' };
const TIE: Record<string, string> = { kin: '亲人', friend: '好友', master: '师父', disciple: '弟子', sworn: '结义', lover: '道侣', foe: '宿敌' };
const BOND: Record<string, string> = { companion: '同行的伙伴', guard: '护法', sworn: '结义兄弟', master: '你的弟子（对方拜你为师）', disciple: '你的师父' };
/** 性情：说话方式 + 好感结算倍率（正 / 负） */
const PERS_STYLE: Record<Pers, { voice: string; up: number; down: number }> = {
  righteous: { voice: '为人正直，说话坦荡，嫉恶如仇，看不惯阴私之事', up: 1, down: 1.1 },
  greedy: { voice: '贪财好利，三句不离灵石与好处，见钱眼开，也精于算计', up: 1.2, down: 0.8 },
  cautious: { voice: '谨慎多疑，话只说三分，不轻易交底，对陌生人多有提防', up: 0.7, down: 0.9 },
  arrogant: { voice: '心高气傲，居高临下，瞧不上修为不如自己的人，受不得半点顶撞', up: 0.6, down: 1.4 },
  kind: { voice: '性情温和，待人宽厚，乐于指点，说话体贴', up: 1.2, down: 0.7 },
  ruthless: { voice: '心狠手辣，言辞带刺，冷笑着说话，一言不合便有杀意', up: 0.7, down: 1.5 },
  aloof: { voice: '淡泊寡言，不喜应酬，往往只回几个字，对俗事兴趣索然', up: 0.6, down: 0.8 },
};
const HOURS = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const SEASON = ['春', '春', '春', '夏', '夏', '夏', '秋', '秋', '秋', '冬', '冬', '冬'];
/** 后端不可用时的本地台词 */
const FALLBACK: Record<Pers, string[]> = {
  righteous: ['道友有话，不妨直说。', '这话说得在理。'], greedy: ['嘿嘿，说这些不如谈谈灵石。', '有好处的事，算我一份。'],
  cautious: ['……此事我不便多言。', '道友打听这些做什么？'], arrogant: ['哼，你也配与我说话？', '有话快说，我没工夫陪你闲扯。'],
  kind: ['道友莫急，慢慢说。', '能帮上忙的，我自当尽力。'], ruthless: ['少废话。', '再多嘴，休怪我不客气。'], aloof: ['嗯。', '……随你。'],
};

export class NpcChat {
  /** 后端可用（创空间版）才显示对话框 */
  available = false;
  private checked = false;
  private sid = '';
  constructor(private g: Game) {}

  /** 进游戏时探一下后端 */
  probe() {
    if (this.checked) return; this.checked = true;
    if (typeof location === 'undefined' || !/^https?:/.test(location.protocol) || typeof fetch === 'undefined') return;
    try { this.sid = localStorage.getItem('taixu.npc.sid') || ''; if (!this.sid) { this.sid = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('taixu.npc.sid', this.sid); } } catch { this.sid = 'anon'; }
    fetch('./api/npc/health').then((r) => (r.ok ? r.json() : null)).then((j) => { this.available = !!j?.ok; this.g.updateUI(true); }).catch(() => { this.available = false; });
  }

  // ------------------------------------------------------------ 记忆（随存档走）
  private mem(key: string): Memory {
    const ws = this.g.ws as any; ws.chat ??= {};
    return (ws.chat[key] ??= { log: [], notes: [], n: 0 });
  }
  keyOf(t: ChatTarget) { return t.kind === 'keeper' ? 'shop:' + (t.shop.sellerId ?? hashName(t.shop.title + (t.shop.loc ?? ''))) : t.kind + ':' + t.id; }
  history(t: ChatTarget) { return this.mem(this.keyOf(t)).log; }

  // ------------------------------------------------------------ 人物卡
  private npcData(t: ChatTarget): NpcData | null {
    if (t.kind === 'npc') return this.g.npcs.byId.get(t.id) ?? null;
    if (t.kind === 'beauty') return this.g.npcs.byId.get('b_' + t.id) ?? null;
    if (t.shop.sellerId) return this.g.npcs.byId.get(t.shop.sellerId) ?? null;
    return null;
  }
  nameOf(t: ChatTarget) { if (t.kind === 'keeper' && !t.shop.sellerId) return keeper(t.shop).name; return this.npcData(t)?.name ?? (t.kind === 'beauty' ? BEAUTY_BY_ID[t.id]?.name : '') ?? '对方'; }

  persona(t: ChatTarget): Record<string, unknown> {
    const g = this.g, d = this.npcData(t);
    if (t.kind === 'keeper' && !d) {
      const k = keeper(t.shop), loc = t.shop.loc ? LOC_BY_ID.get(t.shop.loc) : null;
      return { name: k.name, sex: k.sex, age: k.age, identity: `${loc?.name ?? ''}${t.shop.title.split(' · ').pop()}的掌柜，凡人`, realm: '凡人（不通修炼）', pers: PERS_NAME[k.pers], voice: PERS_STYLE[k.pers].voice + '；做生意讲究和气生财，见多了修士，不卑不亢',
        home: loc?.name ?? '', goods: t.shop.stock.slice(0, 10).map((s) => `${itemDef(s.id).name}（${s.price}灵石）`) };
    }
    if (!d) return { name: this.nameOf(t), identity: '路人' };
    const b = d.beauty ? BEAUTY_BY_ID[d.beauty] : null;
    const home = LOC_BY_ID.get(d.home), sect = d.sect ? g.rel?.sectName(d.sect) : '';
    const style = PERS_STYLE[d.pers] ?? PERS_STYLE.cautious;
    const P: Record<string, unknown> = {
      name: d.name, sex: d.sex === 'f' ? '女' : '男', age: Math.round(d.age),
      identity: [d.title, sect ? `${sect}门人` : FACTION[d.faction], ROLE[d.role]].filter(Boolean).join('，'),
      realm: d.realm === 0 ? '凡人（不通修炼）' : realmName(d.realm, d.stage),
      pers: PERS_NAME[d.pers], voice: style.voice,
      home: home ? `${home.name}（${MAP_NAME[home.map]}）` : '', alive: d.alive,
      wealth: d.wealth > 50000 ? '家底殷实' : d.wealth > 3000 ? '小有积蓄' : d.wealth > 200 ? '手头不宽裕' : '穷困',
      canon: !!d.canon && !d.mod, story: '',
    };
    if (b) { P.identity = `${b.title}`; P.story = b.intro; P.voiceSamples = b.greet.slice(0, 3); P.likes = b.likes.map((x) => (/_/.test(x) ? itemDef(x).name : x)).slice(0, 4); }
    if (d.gf && GONGFA[d.gf]) P.gongfa = GONGFA[d.gf].name;
    if (d.arts?.length) P.arts = d.arts.map((a) => ARTS[a]?.name).filter(Boolean).slice(0, 4);
    if (d.bag) P.treasures = Object.keys(d.bag).map((id) => itemDef(id)).sort((x, y) => y.price - x.price).slice(0, 3).map((x) => x.name);
    if (d.ties?.length) P.ties = d.ties.slice(0, 5).map((tie) => { const o = g.npcs.byId.get(tie.id); return o ? `${TIE[tie.k] ?? tie.k}：${o.name}${o.alive ? '' : '（已故）'}` : ''; }).filter(Boolean);
    if (d.plan) P.plan = d.plan.why;
    if (d.bio?.length) P.life = d.bio.slice(-4).map((x) => x.t);
    if (d.hate?.length) P.hates = d.hate.slice(0, 3).map((x) => `${g.npcs.byId.get(x.id)?.name ?? '某人'}（${x.why}）`);
    if (d.grief) P.mood = `正在服丧（${d.griefWhy ?? ''}），心绪低落`;
    else if (d.inj) P.mood = '身上带伤，精神不济';
    return P;
  }

  /** 玩家卡（苏寒此刻的样子） */
  player(known = true): Record<string, unknown> {
    const g = this.g, h = g.hero, p = g.player, ws = g.ws as any;
    const loc = g.nearbyLocation();
    const root = ROOTS.find((r) => r.id === h.root);
    const sect = ws.sect ? `${g.rel?.sectName(ws.sect.id) ?? ''}${SECT_RANKS[ws.sect.rank] ?? ''}` : '无门无派的散修';
    const gear = [h.equip?.flight, h.equip?.armor].filter(Boolean).map((id) => itemDef(id!).name);
    const arts = [...h.arts].sort((a, b) => b.xp - a.xp).slice(0, 4).map((a) => ARTS[a.id]?.name).filter(Boolean);
    const news = (ws.news ?? []).filter((n: any) => n.kind === 'personal').slice(-4).map((n: any) => n.text);
    const curId = worldCurrencyId(ACTIVE_WORLD), curName = worldCurrencyName(ACTIVE_WORLD);
    const ling = C.bagCount(h, curId);
    const rich = ACTIVE_WORLD === 'human' ? (ling > 20000 ? '身家丰厚' : ling > 2000 ? `颇有些${curName}` : ling > 200 ? '囊中尚可' : '囊中羞涩')
      : (ling > 500 ? '身家丰厚' : ling > 50 ? `颇有些${curName}` : ling > 10 ? '囊中尚可' : '囊中羞涩');
    return {
      name: known ? (h.name ?? '苏寒') : '（尚未通名的修士）', sex: '男', age: Math.floor(h.age), realm: realmName(h.realm, h.stage), root: root?.name ?? '',
      sect, fame: repName(ws.rep ?? 0), purse: rich,
      gear, arts, recent: news, where: loc ? loc.name : `${(g as any).ui?.region ?? '荒野'}（${(g as any).ui?.regionParent ?? ''}）`, followers: g.npcs.followers().map((a) => a.d.name).slice(0, 3),
      flying: !!p.flying,
    };
  }

  /** 此刻的世界 */
  world(): Record<string, unknown> {
    const g = this.g, day = Math.floor(g.day), m = Math.floor((day % 360) / 30);
    const ph = g.dayPhase, hr = HOURS[Math.floor((ph * 24 + 1) / 2) % 12];
    const canon = ((g.ws as any).news ?? []).filter((n: any) => n.kind === 'canon' || n.kind === 'rumor').slice(-3).map((n: any) => n.text);
    return { date: `第${Math.floor(day / 360) + 1}年${SEASON[m]}${m + 1}月`, hour: `${hr}时`, weather: WEATHER_NAME[g.weather.kind as keyof typeof WEATHER_NAME] ?? '', map: MAP_NAME[ACTIVE_MAP], news: canon };
  }

  /** 称呼与分寸：按两人修为差给出明确的规矩（模型最容易在这里出戏） */
  etiquette(t: ChatTarget): string {
    const d = this.npcData(t), h = this.g.hero;
    if (!d || d.realm === 0) return h.realm >= 1 ? '你是凡人，对方是修仙者：你敬畏对方，称对方「仙师」「仙长」，自称「小人」「在下」，不敢怠慢。' : '你们都是凡人，平辈相称。';
    const gap = (d.realm * 10 + d.stage) - (h.realm * 10 + h.stage), big = d.realm - h.realm;
    if (big >= 2) return `你的修为（${realmName(d.realm, d.stage)}）远高于对方（${realmName(h.realm, h.stage)}），对方在你眼里只是晚辈小修。你可称对方「小友」「小辈」，自称「老夫 / 本座 / 我」，语气居高临下或长辈般随意；对方若不敬，你会不悦甚至动怒。`;
    if (big === 1) return `你比对方高一个大境界，是前辈。称对方「小友」「道友」，自称「我」；对方应以「前辈」称你，失礼会让你不快。`;
    if (big === 0) return gap >= 0 ? '你们修为相当，以「道友」相称，平辈说话。' : '你们同属一个大境界，对方略高半筹，以「道友」相称，你说话客气些。';
    if (big === -1) return `对方比你高一个大境界，是前辈。你称对方「前辈」，自称「晚辈」，说话恭敬，不敢顶撞。`;
    return `对方的修为（${realmName(h.realm, h.stage)}）远在你之上，你在对方面前如同蝼蚁。你称对方「前辈」，自称「晚辈」，战战兢兢，言语极为恭敬${d.pers === 'arrogant' || d.pers === 'ruthless' ? '，平日的傲气此刻半点也不敢露' : ''}。`;
  }

  /** 对方认不认得你（聊过、有交情、有关系、或是红颜已相识） */
  private knows(t: ChatTarget) {
    const d = this.npcData(t), m = this.mem(this.keyOf(t));
    if (m.n > 0) return true;
    if (!d) return false;
    if (d.beauty) return !!(this.g.ws as any).hearts?.[d.beauty]?.met;
    return Math.abs(d.favor) >= 15 || !!d.bond || d.grudge > 0 || !!d.taught || !!d.spar;
  }
  private relation(t: ChatTarget): Record<string, unknown> {
    const d = this.npcData(t), m = this.mem(this.keyOf(t));
    const r: Record<string, unknown> = { met: this.knows(t), talks: m.n, notes: m.notes.slice(-6) };
    if (d) {
      r.favor = Math.round(d.favor);
      r.feeling = d.favor >= 75 ? '视对方为知己' : d.favor >= 45 ? '与对方交好' : d.favor >= 15 ? '对对方有些好感' : d.favor > -15 ? '与对方不过点头之交' : d.favor > -50 ? '对对方心存不满' : '对对方恨之入骨';
      if (d.grudge >= 2) r.grudge = `与对方有不死不休的血仇（${d.why ?? ''}）`; else if (d.grudge === 1) r.grudge = `记着对方的仇（${d.why ?? ''}）`;
      if (d.bond) r.bond = BOND[d.bond] ?? d.bond;
      if (d.beauty) { const s = (this.g.ws as any).hearts?.[d.beauty]; if (s) r.heart = `红颜好感 ${Math.round(s.favor)}`; }
    }
    return r;
  }

  // ------------------------------------------------------------ 说一句
  async send(t: ChatTarget, text: string): Promise<ChatResult> {
    const key = this.keyOf(t), m = this.mem(key), say = text.trim().slice(0, 200);
    const payload = {
      sid: this.sid, text: say,
      npc: this.persona(t), player: this.player(this.knows(t)), world: this.world(), rel: this.relation(t), etiquette: this.etiquette(t),
      history: m.log.slice(-10),
      scene: t.kind === 'keeper' ? '在铺子里看货，与掌柜说话' : this.sceneOf(t),
      shop: t.kind === 'keeper' ? { goods: t.shop.stock.slice(0, 10).map((s) => `${itemDef(s.id).name} ${s.price}灵石`), tries: m.deal && m.deal.day === Math.floor(this.g.day) ? m.deal.tries : 0 } : null,
    };
    let res: ChatResult;
    try {
      const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const tm = setTimeout(() => ctl?.abort(), 32000);
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: ctl?.signal });
      clearTimeout(tm);
      const j = await r.json();
      res = j?.ok && j.say ? j : this.local(t);
    } catch { res = this.local(t); }
    this.settle(t, say, res);
    return res;
  }
  private sceneOf(t: ChatTarget) {
    const loc = this.g.nearbyLocation();
    return `${loc ? `在${loc.name}` : '在野外'}${t.kind === 'beauty' ? '与对方相会' : '当面交谈'}`;
  }
  private local(t: ChatTarget): ChatResult {
    const d = this.npcData(t), L = FALLBACK[d?.pers ?? 'cautious'];
    return { ok: false, fallback: true, say: L[Math.floor(Math.random() * L.length)], tone: 'polite', delta: 0 };
  }

  /** 结算：好感按性情夹紧（每日正向至多 +12）；辱骂威胁可能结仇；掌柜议价改货价 */
  private settle(t: ChatTarget, said: string, res: ChatResult) {
    const g = this.g, key = this.keyOf(t), m = this.mem(key), d = this.npcData(t), day = Math.floor(g.day);
    m.n++;
    m.log.push({ w: 'p', t: said }, { w: 'n', t: String(res.say).slice(0, 200), act: res.act ? String(res.act).slice(0, 40) : undefined, tone: res.tone });
    if (m.log.length > 16) m.log.splice(0, m.log.length - 16);
    if (res.note && typeof res.note === 'string') { const n = res.note.slice(0, 40); if (!m.notes.includes(n)) m.notes.push(n); if (m.notes.length > 8) m.notes.shift(); }
    if (res.fallback) return;
    if (d) {
      const st = PERS_STYLE[d.pers] ?? PERS_STYLE.cautious;
      let dv = Math.max(-30, Math.min(8, Math.round(+res.delta || 0)));
      dv = Math.round(dv * (dv >= 0 ? st.up : st.down));
      if (m.favDay !== day) { m.favDay = day; m.favToday = 0; }
      if (dv > 0) { dv = Math.min(dv, 12 - (m.favToday ?? 0)); m.favToday = (m.favToday ?? 0) + Math.max(0, dv); }
      if (dv) {
        if (d.beauty) { const s = (g.ws as any).hearts?.[d.beauty]; if (s) s.favor = Math.max(-100, Math.min(100, s.favor + dv)); }
        d.favor = Math.max(-100, Math.min(100, d.favor + dv)); d.met = true;
        g.toast(`${d.name}${dv > 0 ? '对你多了几分好感' : '对你心生不快'}（${dv > 0 ? '+' : ''}${dv}）`, dv > 0 ? 'good' : 'warn');
      }
      if ((res.tone === 'insult' || res.tone === 'threat') && d.favor <= -50 && d.grudge < 1 && !d.bond) { d.grudge = 1; d.why = '言语冲撞，结下梁子'; g.toast(`${d.name}记恨上你了。`, 'warn'); }
      const a = g.npcs.activeOf(d.id); if (a) a.bubble = { text: String(res.say).slice(0, 40), t: 3.5 };
      // 撂下狠话、又已恨你入骨的人，真的会动手（同行者、结义、师徒不会）
      if (res.tone === 'threat' && d.favor <= -50 && !d.bond && d.realm > 0 && a && !a.enemy && (d.pers === 'ruthless' || d.pers === 'arrogant' || d.grudge >= 1)) {
        setTimeout(() => { if (!a.enemy && d.alive) { g.closeModal(true); g.npcs.toEnemy(a, true); g.toast(`${d.name}动手了！`, 'warn'); } }, 1800);
      }
    }
    if (t.kind === 'keeper' && res.bargain && res.bargain !== 'none') {
      m.deal = m.deal && m.deal.day === day ? m.deal : { day, tries: 0, price: 1 };
      m.deal.tries++;
      const k = Math.max(0.85, Math.min(1, +(res.price ?? 1) || 1));
      if (k < m.deal.price) {
        for (const s of t.shop.stock) { const base = (s as any).basePrice ?? s.price; (s as any).basePrice = base; s.price = Math.max(1, Math.round(base * k)); }
        m.deal.price = k; g.toast(`掌柜松了口：货价降到 ${Math.round(k * 100)}%`, 'good');
      }
    } else if (t.kind === 'keeper') { m.deal = m.deal && m.deal.day === day ? m.deal : { day, tries: 0, price: 1 }; m.deal.tries++; }
  }
}

function hashName(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
const SURN = '王李赵陈刘孙周吴郑冯卫蒋沈杨朱秦许何吕施张孔曹严华金魏陶姜'.split('');
const GIVEN_M = ['掌柜', '老实', '福', '财', '贵', '有德', '守仁', '长顺', '二', '三'];
const GIVEN_F = ['三娘', '四娘', '七姑', '巧娘', '婉娘', '素娘'];
const KEEP_PERS: Pers[] = ['greedy', 'kind', 'cautious', 'greedy', 'righteous', 'aloof'];
/** 坊市掌柜：按铺子名与所在地确定（同一间铺子永远是同一个人） */
export function keeper(shop: Shop) {
  let h = parseInt(hashName(shop.title + (shop.loc ?? '')), 36);
  const pick = <T>(a: T[]) => { h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0; return a[h % a.length]; };
  const sex: 'm' | 'f' = pick([0, 0, 1]) ? 'f' : 'm';
  const s = pick(SURN), n = sex === 'f' ? s + pick(GIVEN_F) : s + pick(GIVEN_M);
  return { name: n.length > 3 ? n.slice(0, 3) : n, sex: sex === 'f' ? '女' : '男', age: 30 + (h % 35), pers: pick(KEEP_PERS) };
}
void REALMS; void WORLD_SCALE;
