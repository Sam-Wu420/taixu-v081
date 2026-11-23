// P11d 拍卖会：竞价的是真的 NPC，花的是他们自己的灵石。
//
// 每座大城每季末开拍（每季第 80–89 日，见 Towns.auctionOpen）。头一回有人来看（你进场，或季末结算）时，
// 从这座城所在的价区、同一张图上挑 6–12 位真实存在的修士入座：
//   · 有所求的：卡在大境界瓶颈、袋里没有破境丹的，冲着那枚破境丹来；寿元将尽的，冲着延寿之物来；
//   · 宗门长老（宗门职位到长老）：可以代宗门出价，钱是自己的加上同门凑的（各出两成）；
//   · 豪客：价区里身家最厚的几位；
//   · 和你有仇的，若在价区里，多半也会来（见了你举牌，他也要压你一头）。
// 每人对每件拍品有个心理价位＝行情 × 需要（破境 2.2、续命 2.5、合用 1–1.25、捡漏 0.75–0.95）× 性子（傲慢 1.25、狠辣 1.1、谨慎 0.8……），
// 再被身家卡住（有急需的最多掏九成五，否则六成）。价位够不上底价的，这件就不举牌。
// 成交：NPC 拍走的，从他（和凑钱的同门）身上扣灵石，东西进他的储物袋；你拍走的，你付钱；没人出到底价的流拍。
// 钱去哪：每件拍品有个寄拍人（价区里真实的 NPC，商人、老修士多些），拿成交价的九成；拍卖行抽一成＝出水口 flow('auction')。
// （起初整笔成交价都算出水口，百年模拟里一年要抽走十几万、筑基修士人数掉了三成，见 P11d 报告；改成寄拍后只有抽成离开世界）
// 你付的那九成进了寄拍人的口袋＝灵石从你流进 NPC 的世界，也记在 'auction' 上（正数）。你没到场的、拍到一半走了的，季末一并按 NPC 之间的出价结算（经济里看得到）。
// 托（江湖骗局 #6）：拍卖行从入座的人里买通一位，那件拍品上他只在你出价后跟着抬，抬到约 2.2 倍底价收手；落到他手里就是流拍（东西回了拍卖行）。
// 记仇：你从别人手里抢走他想要的东西，他会记着——好感下降；傲慢、狠辣、魔道的人若是抢了他急需的或压轴的，就结了仇，
// 出城后来截你的（ws.flags.auctionMark 的「被盯上」）多半就是他（ws.flags.auctionLoser）。
import { KEY_PILL } from './living';
import { flow, tally } from './econ';
import type { Game } from './game';
import { npcMap, type NpcData, type Pers } from './npc';
import type { AuctionLot } from './town';
import { itemDef, type ItemDef } from '../data/items';
import { ALL_LOCATIONS, LOC_BY_ID, ACTIVE_MAP, type LocDef } from '../data/world';
import { REALMS, realmName } from '../data/realms';
import { auctionLevel } from '../data/market';
import { wbZoneOf } from './wanbao';
import * as C from './cultivation';

/** 入座的人。max[i]＝他对第 i 件拍品肯出的最高价（0＝不感兴趣或出不起底价） */
export interface AucSeat {
  id: string; name: string;
  /** 他来做什么：破境 / 续命 / 宗门 / 宿敌 / 豪客 / 淘宝 */
  why: SeatWhy;
  /** 代宗门出价（同门凑钱） */
  pool?: boolean;
  /** 11e 家族集资（亲人、伴侣各凑两成身家） */
  fam?: boolean;
  /** 11e 冲着破境丹来、钱不够向师长同门赊（拍下时才真借，借据记在万宝楼的账上） */
  loan?: boolean;
  max: number[];
  /** 入座时带的钱（代宗门的含同门凑的）、本场已花掉的 */
  purse: number; spent: number;
  /** 对第 i 件举过牌 */
  bid: boolean[];
}
export type SeatWhy = '破境' | '续命' | '宗门' | '宿敌' | '豪客' | '淘宝';
/** 正在拍的这一件 */
export interface AucLive { price: number; lead: string | null; out: string[]; meOut?: boolean; n: number }
export interface AucHouse {
  key: string; loc: string; q: number; lots: AuctionLot[]; seats: AucSeat[]; cur: number; live: AucLive;
  /** 你进过场 */
  came?: boolean; settled?: boolean;
  log: string[];
}
interface AucState { q: number; houses: Record<string, AucHouse>; seated: Record<string, string> }

export type AucEvent =
  | { k: 'bid'; seat: string; name: string; price: number; shill?: boolean; drops: string[] }
  | { k: 'drop'; drops: string[] }
  | { k: 'none' };
export interface AucResult { k: 'me' | 'npc' | 'shill' | 'pass'; lot: AuctionLot; price: number; seat?: AucSeat; lines: string[] }

const PERS_K: Record<Pers, number> = { arrogant: 1.25, ruthless: 1.1, greedy: 1.0, righteous: 1.0, kind: 0.95, aloof: 0.9, cautious: 0.8 };
/** 举牌的积极（谁先跳出来）与一口加多少 */
const EAGER: Record<Pers, number> = { arrogant: 1.8, ruthless: 1.3, greedy: 0.9, righteous: 1, kind: 0.8, aloof: 0.6, cautious: 0.7 };
const JUMP: Record<Pers, [number, number]> = { arrogant: [0.08, 0.25], ruthless: [0.06, 0.16], greedy: [0, 0.04], righteous: [0.02, 0.1], kind: [0, 0.06], aloof: [0, 0.08], cautious: [0, 0.02] };

const KEY_SET = new Set(Object.values(KEY_PILL));
/** 同门凑钱：筑基以上、自己没卡在瓶颈攒钱买破境丹的，各出两成身家 */
const chips = (m: NpcData) => m.realm >= 2 && !(m.stage >= REALMS[m.realm].stages.length - 1 && KEY_PILL[m.realm] && !m.bag?.[KEY_PILL[m.realm]]);
const longevity = (it: ItemDef) => (it.pill?.life ?? 0) > 0 || /延寿|寿元/.test(it.desc);

/** 报价凑整：千以下到十、万以下到五十、十万以下到百、再往上到千 */
export function niceUp(v: number): number { const s = v < 1000 ? 10 : v < 10000 ? 50 : v < 100000 ? 100 : 1000; return Math.ceil(v / s) * s; }
export function niceDown(v: number): number { const s = v < 1000 ? 10 : v < 10000 ? 50 : v < 100000 ? 100 : 1000; return Math.floor(v / s) * s; }
/** 眼下最少要出多少：没人举牌是底价，有人领先是加半成 */
export function needOf(lot: AuctionLot, live: AucLive): number { return live.lead ? Math.max(niceUp(live.price * 1.05), live.price + 10) : lot.base; }

const N = (v: number) => v.toLocaleString('zh-CN');
function hs(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed: number) { let s = seed >>> 0 || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

export class AuctionSys {
  constructor(readonly game: Game) {}
  get S(): AucState {
    const ws = this.game.ws as unknown as { auction?: AucState };
    return (ws.auction ??= { q: Math.floor(this.game.day / 90), houses: {}, seated: {} });
  }
  key(l: LocDef, q = Math.floor(this.game.day / 90)) { return `${l.id}_${q}`; }
  /** 这一季这座城的拍卖会（第一次问到时摆拍品、请人入座、安排托） */
  house(l: LocDef, q = Math.floor(this.game.day / 90)): AucHouse {
    const S = this.S, k = this.key(l, q);
    let h = S.houses[k];
    if (!h) {
      // 11e 分场：雄城、天下名城的正场拍品配得上在场买家的身家（价区里第三厚的钱袋，含代宗门、家族集资），压轴另算——
      // 原来观星城、玄京的拍品七千到三十万，价区里最有钱的 NPC 才六千多，整场流拍
      const lots = this.game.towns.auctionLots(l, q, auctionLevel(l) >= 5 ? this.buyerCap(l) : undefined);
      h = S.houses[k] = { key: k, loc: l.id, q, lots, seats: [], cur: 0, live: { price: lots[0]?.base ?? 0, lead: null, out: [], n: 0 }, log: [] };
      h.seats = this.pickSeats(l, h);
      this.pickConsignors(l, h);
      this.game.jianghu?.planShills(l, lots, h.seats, q);
      h.live.price = lots[0]?.base ?? 0;
    }
    return h;
  }
  seat(h: AucHouse, id: string | null | undefined) { return id ? h.seats.find((s) => s.id === id) : undefined; }
  /** 11e 亲人、伴侣（同图同价区）身上一共多少灵石：家族集资的底子 */
  kinMoney(d: NpcData, l: LocDef, z = wbZoneOf(l)): number {
    let v = 0;
    for (const t of d.ties ?? []) {
      if (t.k !== 'kin' && t.k !== 'lover') continue;
      const o = this.npc(t.id);
      if (o?.alive && o !== d && npcMap(o) === l.map && wbZoneOf(LOC_BY_ID.get(o.home)) === z) v += Math.max(0, o.wealth);
    }
    return v;
  }
  /** 11e 这一场买家的钱袋有多厚：价区里同图修士各自能动用的钱（本人 + 代宗门的同门两成 / 家族两成），取第三厚的（要有人竞价） */
  buyerCap(l: LocDef): number {
    const g = this.game, z = wbZoneOf(l), pool: NpcData[] = [], sm = new Map<string, number>();
    for (const d of g.npcs.list) {
      if (!d.alive || d.realm < 1 || d.hidden || d.faction === 'mortal' || npcMap(d) !== l.map) continue;
      const H = LOC_BY_ID.get(d.home); if (!H || wbZoneOf(H) !== z) continue;
      g.living?.ensure(d);
      pool.push(d);
      if (d.sect && chips(d)) sm.set(d.sect, (sm.get(d.sect) ?? 0) + Math.max(0, d.wealth));
    }
    const eff = pool.map((d) => { const own = Math.max(0, d.wealth), elder = !!d.sect && (d.srk ?? 0) >= 3; return own + (elder ? Math.max(0, (sm.get(d.sect!) ?? 0) - (chips(d) ? own : 0)) * 0.2 : this.kinMoney(d, l, z) * 0.2); }).sort((a, b) => b - a);
    return eff.length ? eff[Math.min(2, eff.length - 1)] : 0;
  }
  npc(id: string) { return this.game.npcs.byId.get(id); }

  // ------------------------------------------------------------ 入座
  /** 价区里、同一张图上的修士：按想要什么、出得起多少挑 6–12 位 */
  pickSeats(l: LocDef, h: AucHouse): AucSeat[] {
    const g = this.game, z = wbZoneOf(l), A = auctionLevel(l), S = this.S;
    const rnd = rng(hs(h.key) ^ 0x51ed);
    const followers = new Set(g.npcs.followers?.().map((a) => a.d.id) ?? []);
    const pool: NpcData[] = [];
    for (const d of g.npcs.list) {
      if (!d.alive || d.realm < 1 || d.hidden || d.chasing || d.hunting || d.faction === 'mortal' || followers.has(d.id)) continue;
      if (npcMap(d) !== l.map) continue;
      const H = LOC_BY_ID.get(d.home); if (!H || wbZoneOf(H) !== z) continue;
      if (S.seated[d.id] && S.seated[d.id] !== h.key && S.houses[S.seated[d.id]]?.q === h.q) continue;   // 一季只去一处
      g.living?.ensure(d);   // 身家（储物袋）是用到时才生成的
      pool.push(d);
    }
    if (!pool.length) return [];
    // 同门凑钱的底子
    const sectMoney = new Map<string, number>();
    for (const d of pool) if (d.sect && chips(d)) sectMoney.set(d.sect, (sectMoney.get(d.sect) ?? 0) + Math.max(0, d.wealth));
    const enemy = (d: NpcData) => (d.grudge ?? 0) > 0 && d.met && !d.vow;
    type Cand = { d: NpcData; why: SeatWhy; pool: boolean; max: number[]; score: number; own: number; mates: number; fam?: number; back?: number };
    const cands: Cand[] = [];
    for (const d of pool) {
      const r2 = rng(hs(h.key + d.id));
      const elder = !!d.sect && (d.srk ?? 0) >= 3;
      const own = Math.max(0, d.wealth), mates = elder ? Math.max(0, (sectMoney.get(d.sect!) ?? 0) - (chips(d) ? own : 0)) * 0.2 : 0;
      const kp = d.stage >= REALMS[d.realm].stages.length - 1 ? KEY_PILL[d.realm] : undefined;
      const needKp = !!kp && !(d.bag?.[kp]);
      // 11e 家族集资（不是代宗门的长老才有）；赊丹：台上有他缺的那枚破境丹，师长同门肯借多少（最多两倍半底价）
      const kinM = elder ? 0 : this.kinMoney(d, l, z) * 0.2;
      const kpLot = needKp ? h.lots.find((x) => x.id === kp) : undefined;
      const back = kpLot ? Math.min(g.wanbao.backers(d, Infinity, z).got, kpLot.base * 2.5) : 0;
      const aged = d.realm >= 2 && d.age > d.life * 0.8;
      const pk = PERS_K[d.pers] ?? 1;
      let why: SeatWhy = elder ? '宗门' : '淘宝', score = 0;
      if (enemy(d)) why = '宿敌';
      const max = h.lots.map((lot) => {
        const it = itemDef(lot.id), mv = lot.base / 0.75;
        let want = 0, urgent = false;
        if (needKp && lot.id === kp) { want = 2.2; urgent = true; why = '破境'; }
        else if (KEY_SET.has(lot.id)) want = 0;   // 别人的破境丹：自己用不上（宗门买来也没处分给弟子），不争
        else if (aged && longevity(it)) { want = 2.5; urgent = true; why = '续命'; }
        else if (Math.abs(it.tier - d.realm) <= 1 || (lot.top && it.tier <= d.realm + 2)) want = 1 + r2() * 0.25 + (lot.top ? 0.1 : 0);
        else if (r2() < 0.35) want = 0.75 + r2() * 0.2;
        if (!want) return 0;
        const purse = own + ((want >= 1 || lot.top) ? (elder ? mates : kinM) : 0) + (urgent && lot === kpLot ? back : 0);
        let m = mv * want * pk * (0.85 + r2() * 0.3);
        if (why === '宿敌') m *= 1.1;
        m = Math.min(m, purse * (urgent ? 0.95 : want >= 1 ? 0.8 : 0.5));
        m = niceDown(m);
        if (m < lot.base) return 0;
        score += (m / lot.base) * (urgent ? 3 : 1);
        return m;
      });
      if (enemy(d)) score += 2;
      const usePool = elder && max.some((m, i) => m > own * 0.5 && m >= h.lots[i].base);
      const useFam = !elder && kinM > 0 && max.some((m, i) => h.lots[i] !== kpLot && m > own * 0.8 && m >= h.lots[i].base);
      const useLoan = back > 0 && !!kpLot && max[h.lots.indexOf(kpLot)] > own * 0.95;
      if (score <= 0 && !enemy(d)) { if (own > 0) cands.push({ d, why: '豪客', pool: false, max, score: own / 1e6, own, mates }); continue; }
      cands.push({ d, why: usePool ? (why === '淘宝' ? '宗门' : why) : why === '宗门' ? '淘宝' : why, pool: usePool, max, score: score + rnd() * 0.3, own, mates, fam: useFam ? kinM : undefined, back: useLoan ? back : undefined });
    }
    cands.sort((a, b) => b.score - a.score);
    const n = Math.min(12, Math.max(6, 4 + A + Math.floor(rnd() * 3)));
    // 座次：代宗门的长老至多三位（各宗一位）、有急需的至多三位、宿敌一位，其余按想要的程度
    const chosen: Cand[] = [], sects = new Set<string>();
    const take = (c: Cand) => { if (chosen.length < n && !chosen.includes(c)) chosen.push(c); };
    for (const c of cands) if (c.pool && c.score >= 0.5 && sects.size < 3 && !sects.has(c.d.sect!)) { sects.add(c.d.sect!); take(c); }
    cands.filter((c) => (c.why === '破境' || c.why === '续命') && !c.pool).slice(0, 3).forEach(take);
    cands.filter((c) => c.why === '宿敌').slice(0, 1).forEach(take);
    for (const c of cands) if (c.score >= 0.5 && !c.pool) take(c);
    // 剩下的座位：价区里身家最厚的几位（来看热闹、偶尔捡漏）
    if (chosen.length < 6) {
      const rich = cands.filter((c) => !chosen.includes(c)).sort((a, b) => b.d.wealth - a.d.wealth);
      for (const c of rich) { if (chosen.length >= 6) break; chosen.push({ ...c, why: c.why === '淘宝' || c.score < 0.5 ? '豪客' : c.why }); }
    }
    for (const c of chosen) S.seated[c.d.id] = h.key;
    return chosen.map((c) => ({ id: c.d.id, name: c.d.name, why: c.why, pool: c.pool || undefined, fam: c.fam ? true : undefined, loan: c.back ? true : undefined, max: c.max, bid: h.lots.map(() => false), purse: Math.floor(c.own + (c.pool ? c.mates : 0) + (c.fam ?? 0) + (c.back ?? 0)), spent: 0 }));
  }
  /** 他对眼下这件还肯出多少（本场花了钱，余下的就少了） */
  limit(s: AucSeat, i: number): number {
    const m = s.max[i] ?? 0; if (!m) return 0;
    return Math.min(m, niceDown((s.purse - s.spent) * 0.95));
  }

  // ------------------------------------------------------------ 竞价
  /** 场上 NPC 的下一手：有人肯出到「眼下最少要出的价」就举牌（托只在你领先时跟）；出不起的放下牌子 */
  npcAct(h: AucHouse, rnd: () => number = Math.random): AucEvent {
    const lot = h.lots[h.cur], live = h.live;
    if (!lot || lot.done) return { k: 'none' };
    const need = needOf(lot, live);
    const drops: string[] = [];
    const cands: AucSeat[] = [];
    for (const s of h.seats) {
      if (live.out.includes(s.id) || s.id === live.lead || s.id === lot.shillId) continue;
      const m = this.limit(s, h.cur);
      if (m >= need) cands.push(s);
      else if (s.bid[h.cur] || m > 0) { live.out.push(s.id); drops.push(s.id); }
    }
    // 托：你一出价他就跟，加价不多不少一成
    if (live.lead === 'me' && lot.shillId) {
      const who = this.game.jianghu?.shillBid(lot) ?? null;
      if (who) {
        const s = this.seat(h, lot.shillId);
        const price = Math.max(need, niceUp(live.price * 1.1));
        live.price = price; live.lead = lot.shillId; live.n++; lot.price = price;
        if (s) s.bid[h.cur] = true;
        return { k: 'bid', seat: lot.shillId, name: lot.shill ?? s?.name ?? '', price, shill: true, drops };
      }
    }
    if (!cands.length) return drops.length ? { k: 'drop', drops } : { k: 'none' };
    let tot = 0; const w = cands.map((s) => { const d = this.npc(s.id); const v = Math.pow(this.limit(s, h.cur) / need, 2) * (d ? EAGER[d.pers] ?? 1 : 1); tot += v; return v; });
    let r = rnd() * tot, s = cands[0];
    for (let i = 0; i < cands.length; i++) { r -= w[i]; if (r <= 0) { s = cands[i]; break; } }
    const d = this.npc(s.id), [j0, j1] = JUMP[d?.pers ?? 'righteous'] ?? [0, 0.08];
    const price = Math.min(this.limit(s, h.cur), Math.max(need, niceUp(need * (1 + j0 + rnd() * (j1 - j0)))));
    live.price = price; live.lead = s.id; live.n++; lot.price = price; s.bid[h.cur] = true;
    return { k: 'bid', seat: s.id, name: s.name, price, drops };
  }
  /** 你举牌 */
  playerBid(h: AucHouse, price: number): string | null {
    const lot = h.lots[h.cur], live = h.live;
    if (!lot || lot.done) return '这件已经落槌了';
    if (live.lead === 'me') return '你已是最高价';
    const need = needOf(lot, live);
    if (price < need) return `至少要出 ${need} 灵石`;
    if (C.bagCount(this.game.hero, 'mat_lingshi') < price) return '灵石不足';
    live.price = price; live.lead = 'me'; live.n++; live.meOut = false; lot.price = price;
    h.came = true;
    return null;
  }
  /** 落槌：领先的人买下（你、NPC、托＝流拍），没人举牌＝流拍；然后换下一件 */
  hammer(h: AucHouse): AucResult {
    const lot = h.lots[h.cur], live = h.live, L = LOC_BY_ID.get(h.loc)!, g = this.game;
    const it = itemDef(lot.id);
    let res: AucResult;
    if (live.lead === 'me') {
      const money = C.bagCount(g.hero, 'mat_lingshi');
      if (money < live.price) { live.lead = null; live.price = lot.base; return { k: 'pass', lot, price: 0, lines: ['你囊中灵石不够，拍卖师脸色一沉，此件作废、重新起拍。'] }; }
      C.removeItem(g.hero, 'mat_lingshi', live.price); C.addItem(g.hero, lot.id, 1, lot.age);
      flow('auction', this.payConsignor(lot, live.price));
      lot.done = 'won'; lot.who = '你'; lot.paid = live.price;
      const lines = [`「${N(live.price)} 灵石，成交！」${it.name}归你了。`];
      const ex = g.jianghu?.onAuctionWon(lot, live.price); if (ex) lines.push(ex);
      lines.push(...this.afterPlayerWin(h, h.cur, live.price));
      res = { k: 'me', lot, price: live.price, lines };
    } else if (live.lead && live.lead === lot.shillId) {
      lot.done = 'lost'; lot.who = lot.shill ?? '某人'; lot.whoId = undefined; lot.paid = live.price; lot.boughtIn = true;
      res = { k: 'shill', lot, price: live.price, lines: [lot.exposed ? `${lot.shill}「拍下」了${it.name}——东西不过是回了拍卖行的库房。` : `「${N(live.price)} 灵石，成交！」${it.name}归${lot.shill}。`] };
    } else if (live.lead) {
      const s = this.seat(h, live.lead)!;
      const paid = this.npcPay(s, live.price, L, KEY_SET.has(lot.id)); s.spent += paid;
      if (KEY_SET.has(lot.id) && paid > 0) tally('kpAuc');
      flow('auction', this.payConsignor(lot, paid));
      const d = this.npc(s.id);
      if (d && paid > 0) { const b = (d.bag ??= {}); b[lot.id] = (b[lot.id] ?? 0) + 1; if (it.price >= 1000 || lot.top) g.living?.bio(d, `在${L.name}拍卖会上以 ${paid} 灵石拍得${it.name}`, g.day); }
      lot.done = 'lost'; lot.who = s.name; lot.whoId = s.id; lot.paid = paid;
      res = { k: 'npc', lot, price: paid, seat: s, lines: [`「${N(live.price)} 灵石，成交！」${it.name}归${s.name}${s.pool ? '（代宗门所拍）' : s.fam ? '（家族集资）' : s.loan && KEY_SET.has(lot.id) ? '（师长同门垫付了一部分）' : ''}。`] };
    } else {
      lot.done = 'pass'; lot.who = undefined;
      res = { k: 'pass', lot, price: 0, lines: [`${it.name}底价 ${N(lot.base)} 灵石，无人举牌——流拍。`] };
    }
    tally(`auc${auctionLevel(L) >= 5 ? 'Big' : 'Small'}_${res.k}`); if (res.k === 'npc' || res.k === 'me') tally(`auc${auctionLevel(L) >= 5 ? 'Big' : 'Small'}_v`, res.price);
    h.log.push(...res.lines);
    if (h.log.length > 60) h.log.splice(0, h.log.length - 60);
    this.next(h);
    return res;
  }
  /** 换下一件还没拍的 */
  next(h: AucHouse) {
    const i = h.lots.findIndex((l) => !l.done);
    if (i < 0) { h.settled = true; return; }
    h.cur = i; h.live = { price: h.lots[i].base, lead: null, out: [], n: 0 };
    h.lots[i].price = h.lots[i].base;
  }
  /** 你放弃这一件 / 离场：这件按 NPC 之间的出价直接落槌（你领先的那口作废） */
  settleQuiet(h: AucHouse, rnd: () => number = Math.random): AucResult {
    const lot = h.lots[h.cur], live = h.live;
    if (live.lead === 'me') { live.lead = null; live.price = lot.base; }
    live.meOut = true;
    for (let t = 0; t < 80; t++) { const e = this.npcAct(h, rnd); if (e.k === 'none' || e.k === 'drop') { if (e.k === 'none') break; } }
    return this.hammer(h);
  }
  /** 整场按 NPC 之间结算（季末、你没来或走了） */
  settleAll(h: AucHouse, rnd: () => number = Math.random): AucResult[] {
    const out: AucResult[] = [];
    for (let t = 0; t < 40 && !h.settled && h.lots.some((l) => !l.done); t++) out.push(this.settleQuiet(h, rnd));
    h.settled = true;
    return out;
  }

  // ------------------------------------------------------------ 付钱、记仇
  /** NPC 付钱：代宗门的，本人出一份、同门按两成半身家凑；家族集资的，亲人伴侣按两成凑；赊丹的（kp：拍的是破境丹），先向师长同门借够再付。记出水口 */
  npcPay(s: AucSeat, price: number, L: LocDef, kp = false): number {
    const g = this.game, d = this.npc(s.id);
    if (!d?.alive) return 0;
    const z = wbZoneOf(L);
    if (kp && s.loan && d.wealth < price) { const bk = g.wanbao.backers(d, price - Math.max(0, Math.floor(d.wealth)), z).list; if (bk) { g.wanbao.lend(d, bk); tally('kpLoan'); tally('kpLoanUsed'); } }
    const payers: [NpcData, number][] = [[d, Math.max(0, d.wealth)]];
    if (s.pool && d.sect) {
      for (const m of g.npcs.list) if (m !== d && m.alive && m.sect === d.sect && chips(m) && npcMap(m) === L.map && wbZoneOf(LOC_BY_ID.get(m.home)) === z && m.wealth > 0) payers.push([m, m.wealth * 0.2]);
    } else if (s.fam && !kp) {
      for (const t of d.ties ?? []) { if (t.k !== 'kin' && t.k !== 'lover') continue; const m = this.npc(t.id); if (m && m !== d && m.alive && m.wealth > 0 && npcMap(m) === L.map && wbZoneOf(LOC_BY_ID.get(m.home)) === z && !payers.some((p) => p[0] === m)) payers.push([m, m.wealth * 0.2]); }
    }
    const cap = payers.reduce((a, p) => a + p[1], 0);
    const total = Math.min(price, Math.floor(cap));
    let paid = 0;
    for (let i = 0; i < payers.length; i++) {
      const [m, share] = payers[i];
      const v = i === payers.length - 1 ? total - paid : Math.round(total * share / Math.max(1, cap));
      const t = Math.max(0, Math.min(Math.floor(m.wealth), v));
      m.wealth -= t; paid += t;
    }
    if (paid < total) { const t = Math.min(Math.floor(d.wealth), total - paid); d.wealth -= t; paid += t; }
    flow('auction', -paid);
    return paid;
  }
  /** 拍卖行的抽成 */
  static FEE = 0.1;
  /** 寄拍人收钱（成交价的九成）：返回进了他口袋的数 */
  payConsignor(lot: AuctionLot, price: number): number {
    const d = lot.from ? this.npc(lot.from) : undefined;
    if (!d?.alive || price <= 0) return 0;
    const v = Math.floor(price * (1 - AuctionSys.FEE));
    d.wealth += v;
    return v;
  }
  /** 给每件拍品找个寄拍人：价区里同图的修士，商人、寿元将尽的、身家厚的多些；不和买家撞 */
  pickConsignors(l: LocDef, h: AucHouse) {
    const g = this.game, z = wbZoneOf(l), rnd = rng(hs(h.key) ^ 0xc0115);
    const seated = new Set(h.seats.map((s) => s.id));
    const pool: [NpcData, number][] = [];
    let tot = 0;
    for (const d of g.npcs.list) {
      if (!d.alive || d.realm < 1 || seated.has(d.id) || d.faction === 'mortal' || npcMap(d) !== l.map) continue;
      const H = LOC_BY_ID.get(d.home); if (!H || wbZoneOf(H) !== z) continue;
      const w = (d.faction === 'merchant' ? 3 : 1) * (d.age > d.life * 0.75 ? 2 : 1) * (1 + d.realm * 0.5);
      pool.push([d, w]); tot += w;
    }
    for (const lot of h.lots) {
      if (lot.from || !pool.length) continue;
      let r = rnd() * tot, pick = pool[0][0];
      for (const [d, w] of pool) { r -= w; if (r <= 0) { pick = d; break; } }
      lot.from = pick.id; lot.fromName = pick.name;
    }
  }
  /** 你拍下第 i 件：举过牌、真想要的人记着你 */
  afterPlayerWin(h: AucHouse, i: number, price: number): string[] {
    const g = this.game, lot = h.lots[i], it = itemDef(lot.id), f = g.ws.flags, lines: string[] = [];
    let foe: { d: NpcData; v: number } | null = null, sore = 0, greedy: NpcData | null = null;
    for (const s of h.seats) {
      if (s.id === lot.shillId) continue;
      const m = s.max[i] ?? 0, d = this.npc(s.id);
      if (!d?.alive || !(s.bid[i] || m >= price * 0.85) || m < lot.base) continue;
      const urgent = s.why === '破境' || s.why === '续命';
      g.rel.addFavor(d, -(urgent ? 15 : lot.top ? 10 : 5));
      sore++;
      const hot = d.pers === 'arrogant' || d.pers === 'ruthless' || d.faction === 'demon' || s.why === '宿敌';
      if (hot && (urgent || lot.top || price >= lot.base * 1.6 || s.why === '宿敌')) {
        d.grudge = Math.max(d.grudge ?? 0, 1); d.why = `拍卖会上被你夺走了${it.name}`; d.met = true;
        const v = g.rel.power(d) + m / price;
        if (!foe || v > foe.v) foe = { d, v };
      } else if (d.pers === 'greedy' && !greedy) greedy = d;
    }
    if (foe) {
      const gap = g.rel.power(foe.d) - g.rel.playerLv();
      lines.push(`${foe.d.name}（${realmName(foe.d.realm, foe.d.stage)}）盯着你看了许久，冷哼一声，拂袖离席。`);
      g.rel.log(`拍卖会上你拍走了${it.name}，${foe.d.name}因此记恨于你。`, 'bad');
      if (gap >= -3 && gap <= 7) { f.auctionMark = g.day; f.auctionLoser = foe.d.id; lines.push('（你察觉到有几道神识在你身上停留了片刻……出城时小心些。）'); }
    } else if (it.price > 3000 && Math.random() < 0.3) {
      f.auctionMark = g.day;
      if (greedy) f.auctionLoser = greedy.id;
      lines.push('（你察觉到有几道神识在你身上停留了片刻……出城时小心些。）');
    } else if (sore) lines.push(sore > 1 ? `场中几位道友脸色都不大好看。` : '');
    return lines.filter(Boolean);
  }
  /** 出城后被尾随：先找那位在拍卖会上输给你、记了仇的人 */
  tailLoser(): boolean {
    const g = this.game, f = g.ws.flags, id = f.auctionLoser as string | undefined;
    delete f.auctionLoser;
    const d = id ? this.npc(id) : undefined;
    if (!d?.alive || d.vow || d.bond || d.chasing || d.stay || npcMap(d) !== ACTIVE_MAP) return false;
    const gap = g.rel.power(d) - g.rel.playerLv(); if (gap < -3 || gap > 7) return false;
    d.why ??= '觊觎你在拍卖会上拍得的宝物'; d.met = true;
    if (!g.rel.startHunt(d, true, true)) return false;
    g.toast(`出城不久，你察觉到身后远远缀着一道神识——是拍卖会上的${d.name}。`, 'warn');
    g.rel.log(`${d.name}（${realmName(d.realm, d.stage)}）在拍卖会后尾随而来——${d.why}。`, 'bad');
    return true;
  }

  // ------------------------------------------------------------ 季末结算
  /** 每日：过了一季，把上一季各城没拍完的（你没来的整场）按 NPC 之间的出价结算掉 */
  daily(): void {
    const S = this.S, q = Math.floor(this.game.day / 90);
    if (q <= S.q) return;
    const last = S.q;
    S.q = q;
    if (q - last === 1) {
      for (const L of ALL_LOCATIONS) {
        if (!this.game.towns.isMajorTown(L)) continue;
        const h = this.house(L, last);
        if (!h.settled) this.settleAll(h);
      }
    } else for (const h of Object.values(S.houses)) if (!h.settled) this.settleAll(h);
    // 只留本季的
    for (const k of Object.keys(S.houses)) if (S.houses[k].q < q) delete S.houses[k];
    S.seated = {};
  }
}
