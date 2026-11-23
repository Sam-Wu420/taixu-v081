// P11 万宝楼：寄售、求购、行情。
//
// 一个价区（南荒、沧溟海、中州；别界各自一个）共用一座「万宝楼」的挂单：价区里每座大城的万宝楼都看得到同一批货。
//   寄售：东西挂在楼里，买主是真的 NPC 或你；成交时楼抽一成（手续费＝灵石离开世界的一条出水口）。
//         NPC 袋里用不着的灵草、材料、多余的法器丹药不再凭空换成灵石，而是挂到这里，卖掉才有钱；
//         挂满期限没人要的，楼里按行情四五折收走（丹房、器坊拿去用了＝东西离开世界，灵石记作进水）。
//   求购：缺东西的人贴出「收某物、出价多少、期限多久」，出价先押在楼里。NPC 卡在大境界瓶颈缺破境丹、受了伤缺疗伤丹、
//         寿元将尽缺延寿灵物时会自己贴；你能接单交货，也能自己贴，等人送货上门。
//   行情：每样东西在每个价区一个供需指数（0.6–1.8），每月按这个月的挂单、求购、成交更新；真实价格＝原价×地域系数×指数。
// 全在世界状态（ws.wanbao）里，随存档走。
import { KEY_PILL } from './living';
import { flow, moneySupply, ECON, tally } from './econ';
import type { Game } from './game';
import type { NpcData } from './npc';
import { itemDef, herbAgeMul, ITEM_LIST, type ItemDef } from '../data/items';
import { priceMul, pzOf, zoneOfLoc, cityTier, type Zone } from '../data/market';
import { LOC_BY_ID, ACTIVE_MAP, type LocDef } from '../data/world';
import { REALMS } from '../data/realms';
import { BOATS } from '../data/seabeasts';
import * as C from './cultivation';
import type { Affix } from '../data/gear';
import { audio } from './audio';

export const WANBAO = {
  /** 成交抽成 */
  fee: 0.1,
  /** 多久撮合一次（游戏日） */
  tick: 3,
  /** 一个价区最多挂多少单 / 多少张求购 */
  maxListings: 420, maxOrders: 140,
  /** 挂满期限没人要：楼里按行情几折收走 */
  buyout: 0.45,
  /** 每个价区每月收滞销货的预算（灵石，乘灵脉产出倍数）；别界一界按三成算 */
  budget: 6000,
  /** 供需指数的上下限、每月往 1 回落几成 */
  idxMin: 0.6, idxMax: 1.8, idxDrift: 0.06,
} as const;

/**
 * 11e 宗门月俸的来路：每个宗门每月有一份灵脉收入（第一次用到时按门中修士人数定下，此后不随门人增多而涨，只随总账的灵脉倍数浮动），
 * 月俸从这份收入里出，没花完的存着（最多存一年），花完了这个月领不到灵石（贡献照记）。
 * 原来月俸按「境界 × 职位」直接发，门人越收越多、贡献一路攒上去职位越升越高，百年里这条进水口涨了五倍。
 */
export const SECT_PAY = { perHead: 4, min: 12, store: 12 };
/** 11e 赊丹：卡在大境界瓶颈、自己掏不出破境丹钱的人，向师父、亲人、伴侣借（各出留足口粮后身家的三成），宗门中人还能请同门垫付（同价区筑基以上各出一成五）。
 * 借的钱一分一厘记账，每月从借款人身上超出口粮的部分里还两成五；求购到期没收到货就当场把借的钱退回去。借款人死了这笔账就烂了（出借的人认亏），出借的人死了账就销了。 */
export const LOAN = { kin: 0.3, sect: 0.15, repay: 0.25, /** 赊购单的定金至少押出价的几成 */ dep: 0.3 };
export interface WbLoan {
  /** 出借人：NPC 的 id，或 'hero'（你交货给赊购单，余款他欠你的，还的钱进你的待领） */
  from: string; to: string; v: number; day: number; /** 押在这张求购里（求购到期退款时连本退回） */ order?: number }

/** 价区：人界三张图按地域分（南荒 / 沧溟海 / 中州），别界一界一个 */
export type WbZone = string;
export const WB_ZONE_NAME: Record<string, string> = { TN: '南荒', LX: '沧溟海', DJ: '中州' };
export function wbZoneOf(loc: LocDef | undefined | null): WbZone {
  if (!loc) return 'TN';
  if (loc.map.startsWith('realm-')) return loc.map;
  return pzOf(zoneOfLoc(loc));
}
const zoneOfZone = (z: WbZone): Zone => (z === 'LX' ? 'luanxing' : z === 'DJ' ? 'dajin' : 'tiannan');

export interface WbListing {
  id: number; item: string; n: number; age?: number;
  /** 单价（灵石） */
  price: number;
  /** 卖家：NPC 的 id，或 'hero' */
  seller: string; sellerName: string;
  zone: WbZone; posted: number; until: number;
  /** 收官 D：寄售的装备带着自己的词条（成交、撤回、到期退回、领取都跟着走） */
  affix?: Affix[];
}
export type WbWhy = '破境' | '疗伤' | '续命' | '炼器' | '收藏' | '自用';
export interface WbOrder {
  id: number; item: string; n: number;
  /** 单价（灵石，已押在楼里） */
  price: number;
  buyer: string; buyerName: string; why: WbWhy;
  zone: WbZone; posted: number; until: number;
  /** 11e 赊购单：只押了这么多定金（只有 n＝1 的单子会赊），交货的人先拿定金、余款记账 */
  dep?: number;
}
export interface WbState {
  seq: number;
  listings: WbListing[]; orders: WbOrder[];
  /** 供需指数：`价区|物品` → 指数 */
  idx: Record<string, number>;
  /** 近十二个月的成交均价：`价区|物品` → 价格（旧 → 新） */
  hist: Record<string, number[]>;
  /** 这个月的挂单量、求购量、成交量与成交额（月底结算行情后清零） */
  month: Record<string, { s: number; d: number; n: number; v: number }>;
  /** 寄售所得、退回的货：去任一座万宝楼领 */
  payout: number; returned: { item: string; n: number; age?: number; affix?: Affix[] }[];
  /** 你的寄售成交记录（最新在前） */
  log: { day: number; text: string }[];
  /** 总账：楼里抽走的手续费、收走滞销货付出的灵石（月度 / 累计） */
  ledger: { fee: number; buyout: number; trades: number };
  lastTick: number; lastMonth: number;
  /** 开张那一批货摆过了没有 */
  seeded?: boolean;
  /**
   * 总账的调节（见 econ.ts、regulate）：k＝灵脉产出的倍数（宗门月俸、耕作营生），fee＝成交抽成，buyout＝滞销收购的折扣；
   * base＝开局时每个修士平均身上有多少灵石（调节的目标）；hist＝近几年每月的人均存量
   */
  econ?: { k: number; fee: number; buyout: number; base: number; hist: number[] };
  /** 这个月各价区还能按行情收多少滞销货（丹房、器坊用得掉的就这么多）；用完了只按一成收 */
  bud?: Record<string, number>;
  /** 11e 各宗门的灵脉收入（每月）与账上还能发的月俸 */
  sect?: Record<string, { inc: number; t: number }>;
  /** 11e 赊丹的借据 */
  loans?: WbLoan[];
}

const key = (z: WbZone, id: string) => z + '|' + id;
/** 人 + 日子的哈希（新逻辑不取 Math.random） */
function hash(s: string, n: number): number { let h = 2166136261 ^ n; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); return (h ^ (h >>> 13)) >>> 0; }
/** 是不是破境丹（living 与本文件互相引用，用到时再取） */
const isKeyPill = (id: string) => KEY_PILL[1] === id || KEY_PILL[2] === id || KEY_PILL[3] === id;
const days = (n: number) => n;
/** 东西能不能上万宝楼：灵石本身、杂物不行 */
export const tradable = (it: ItemDef) => it.id !== 'mat_lingshi' && (it.type !== 'misc' || wbBoat(it)) && it.price > 0;
/**
 * 11e 灵舟进万宝楼：两种低阶灵舟（乌篷、破浪，三品以下）当寻常货挂单、求购；玄龟宝船这等重宝不上楼。
 * 灵舟的物品类别仍是杂物（misc，不改），所以单列：BOATS 里有、品阶不过三的就算。
 */
export function wbBoat(it: ItemDef): boolean { return !!BOATS[it.id] && it.tier <= 3; }

export class Wanbao {
  constructor(private readonly game: Game) {}
  /** 总账调节的当前值（没调过就是默认） */
  get econK(): number { return this.S.econ?.k ?? 1; }
  get fee(): number { return this.S.econ?.fee ?? WANBAO.fee; }
  get buyoutK(): number { return this.S.econ?.buyout ?? WANBAO.buyout; }
  get S(): WbState {
    const ws = this.game.ws as unknown as { wanbao?: WbState };
    return (ws.wanbao ??= { seq: 1, listings: [], orders: [], idx: {}, hist: {}, month: {}, payout: 0, returned: [], log: [], ledger: { fee: 0, buyout: 0, trades: 0 }, lastTick: this.game.day, lastMonth: Math.floor(this.game.day / 30) });
  }
  /** 这座城有没有万宝楼：大城、别界的都城 */
  has(loc: LocDef | undefined | null): boolean { return !!loc && (loc.hub === 'capital' || ((loc.type === 'city' || loc.type === 'isle') && cityTier(loc) >= 3)); }

  // ------------------------------------------------------------ 价格
  index(z: WbZone, id: string): number { return this.S.idx[key(z, id)] ?? 1; }
  /** 行情价（单价）：原价 × 年份 × 地域系数 × 供需指数 */
  ref(z: WbZone, id: string, age?: number): number {
    const it = itemDef(id);
    return Math.max(1, Math.round(it.price * herbAgeMul(it, age) * priceMul(it, zoneOfZone(z)) * this.index(z, id) * (z.startsWith('realm-') ? 1.25 : 1)));
  }
  history(z: WbZone, id: string): number[] { return this.S.hist[key(z, id)] ?? []; }
  private mark(z: WbZone, id: string, k: 's' | 'd' | 'n', n: number, v = 0) {
    const m = (this.S.month[key(z, id)] ??= { s: 0, d: 0, n: 0, v: 0 });
    m[k] += n; if (k === 'n') m.v += v;
  }

  // ------------------------------------------------------------ 查
  listingsIn(z: WbZone): WbListing[] { const d = this.game.day; return this.S.listings.filter((l) => l.zone === z && l.until > d && l.n > 0); }
  ordersIn(z: WbZone): WbOrder[] { const d = this.game.day; return this.S.orders.filter((o) => o.zone === z && o.until > d && o.n > 0); }
  mine(): WbListing[] { return this.S.listings.filter((l) => l.seller === 'hero' && l.n > 0); }
  myOrders(): WbOrder[] { return this.S.orders.filter((o) => o.buyer === 'hero' && o.n > 0); }

  // ------------------------------------------------------------ 你的买卖
  private money(): number { return C.bagCount(this.game.hero, 'mat_lingshi'); }
  /** 买下一单里的 n 件 */
  buy(id: number, n: number): string | null {
    const g = this.game, h = g.hero, L = this.S.listings.find((x) => x.id === id);
    if (!L || L.n <= 0 || L.until <= g.day) return '这一单已经卖完或下架了。';
    if (L.seller === 'hero') return '这是你自己挂的货。';
    n = Math.max(1, Math.min(n, L.n));
    const cost = L.price * n;
    if (this.money() < cost) return '灵石不够。';
    C.removeItem(h, 'mat_lingshi', cost);
    if (L.affix) C.addGearItem(h, L.item, L.affix); else C.addItem(h, L.item, n, L.age);   // 收官 D：带词条的装备原样到手
    this.settle(L, n, cost);
    return null;
  }
  /** 一单成交：卖家拿九成（卖家已不在世就散入天地），楼抽一成 */
  private settle(L: WbListing, n: number, cost: number) {
    const S = this.S, fee = Math.round(cost * this.fee);
    L.n -= n;
    S.ledger.fee += fee; S.ledger.trades++;
    this.mark(L.zone, L.item, 'n', n, cost);
    if (L.seller === 'hero') {
      S.payout += cost - fee;
      const it = itemDef(L.item);
      S.log.unshift({ day: Math.floor(this.game.day), text: `${it.name}${n > 1 ? ' ×' + n : ''} 售出，得 ${cost - fee} 灵石（抽成 ${fee}）` }); S.log.length = Math.min(S.log.length, 40);
      this.game.toast(`万宝楼：你寄售的${it.name}${n > 1 ? ' ×' + n : ''}卖出了，${cost - fee} 灵石待领。`, 'good');
    } else {
      const d = this.game.npcs.byId.get(L.seller);
      if (d?.alive) { d.wealth += cost - fee; flow('fee', -fee); }
    }
  }
  /** 寄售：从储物袋取出 n 件挂上去 */
  consign(item: string, n: number, price: number, age: number | undefined, dur: number, loc: LocDef, piece?: C.BagItem): string | null {
    const g = this.game, h = g.hero, it = itemDef(item);
    if (!tradable(it)) return '这东西万宝楼不收。';
    if (!this.has(loc)) return '此地没有万宝楼。';
    const have = C.bagCount(h, item);
    n = Math.max(1, Math.min(n, have));
    if (!have) return '袋里没有这件东西。';
    // 11e 灵舟：正祭在海上的那条不能挂；船身有损的楼里不收（耐久按船记，挂出去的得是完好的）
    if (wbBoat(it)) {
      const B = g.jueyu?.boat;
      if (B?.on && B.id === item && have <= n) return '这条灵舟正祭着，先收起来。';
      if (B && B.hpOf(item) < 0.999) return `${it.name}船身有损（耐久 ${Math.round(B.hpOf(item) * 100)}%），修好了再挂。`;
    }
    price = Math.max(1, Math.round(price));
    if (this.mine().length >= 12) return '你在楼里挂的货已满十二单，先撤掉几单。';
    // 收官 D：装备一件一单，挂的就是袋里那一件（带着它的词条）；已穿的不能挂
    let affix: Affix[] | undefined;
    if (it.type === 'gear') {
      const b = piece && h.bag.includes(piece) && piece.id === item && !piece.worn ? piece : h.bag.find((x) => x.id === item && !x.worn);
      if (!b) return '穿在身上的不能挂，先卸下来。';
      h.bag.splice(h.bag.indexOf(b), 1); n = 1; affix = (b.affix ?? []).map((a) => ({ ...a }));
    } else C.removeItem(h, item, n);
    const z = wbZoneOf(loc);
    this.S.listings.push({ id: this.S.seq++, item, n, age, price, seller: 'hero', sellerName: '你', zone: z, posted: g.day, until: g.day + days(dur), affix });
    this.mark(z, item, 's', n);
    audio.sfx('chime');
    return null;
  }
  /** 撤下自己的寄售：货退回待领 */
  cancel(id: number): void {
    const S = this.S, L = S.listings.find((x) => x.id === id && x.seller === 'hero');
    if (!L || L.n <= 0) return;
    S.returned.push({ item: L.item, n: L.n, age: L.age, affix: L.affix }); L.n = 0;
  }
  /** 交货给这张单子眼下能拿到多少（扣抽成；赊购单只有定金那部分，余款日后他还） */
  fillNow(O: WbOrder, n = 1): number { const cost = O.price * n; return Math.max(0, (O.dep !== undefined ? O.dep : cost) - Math.round(cost * this.fee)); }
  /** 接一张求购：交出 n 件，得出价的九成（赊购单：先得定金扣抽成，余款记成他欠你的账，还了进待领） */
  fill(id: number, n: number): string | null {
    const g = this.game, h = g.hero, O = this.S.orders.find((x) => x.id === id);
    if (!O || O.n <= 0 || O.until <= g.day) return '这张求购已经收满或撤了。';
    if (O.buyer === 'hero') return '这是你自己贴的求购。';
    n = Math.max(1, Math.min(n, O.n, C.bagCount(h, O.item)));
    if (!C.bagCount(h, O.item)) return '袋里没有这件东西。';
    if (O.dep !== undefined) n = 1;
    C.removeItem(h, O.item, n);
    const cost = O.price * n, fee = Math.round(cost * this.fee), now = this.fillNow(O, n);
    if (now > 0) C.addItem(h, 'mat_lingshi', now);
    if (O.dep !== undefined && cost > O.dep) { (this.S.loans ??= []).push({ from: 'hero', to: O.buyer, v: cost - O.dep, day: Math.floor(g.day) }); O.dep = undefined; }
    O.n -= n; this.S.ledger.fee += fee; this.S.ledger.trades++;
    this.mark(O.zone, O.item, 'n', n, cost);
    if (O.why === '破境') { tally('kpOrderFill', n); this.loanFilled(O.id); }
    const d = g.npcs.byId.get(O.buyer);
    if (d?.alive) { const b = (d.bag ??= {}); b[O.item] = (b[O.item] ?? 0) + n; }
    audio.sfx('chime');
    return null;
  }
  /** 贴求购：出价先押在楼里 */
  post(item: string, n: number, price: number, dur: number, loc: LocDef): string | null {
    const g = this.game, it = itemDef(item);
    if (!tradable(it)) return '这东西万宝楼不收。';
    n = Math.max(1, Math.round(n)); price = Math.max(1, Math.round(price));
    if (this.money() < n * price) return '灵石不够押出价。';
    if (this.myOrders().length >= 6) return '你贴的求购已满六张。';
    C.removeItem(g.hero, 'mat_lingshi', n * price);
    const z = wbZoneOf(loc);
    this.S.orders.push({ id: this.S.seq++, item, n, price, buyer: 'hero', buyerName: '你', why: '自用', zone: z, posted: g.day, until: g.day + dur });
    this.mark(z, item, 'd', n);
    return null;
  }
  /** 撤下自己的求购：押金退回待领 */
  unpost(id: number): void { const O = this.S.orders.find((x) => x.id === id && x.buyer === 'hero'); if (!O || O.n <= 0) return; this.S.payout += O.n * O.price; O.n = 0; }
  /** 领取：寄售所得、退回的货、收满的求购 */
  collect(): { stones: number; items: number } {
    const S = this.S, h = this.game.hero, stones = S.payout;
    if (stones > 0) C.addItem(h, 'mat_lingshi', stones);
    S.payout = 0;
    let items = 0; for (const r of S.returned) { if (r.affix) C.addGearItem(h, r.item, r.affix); else C.addItem(h, r.item, r.n, r.age); items += r.n; }   // 收官 D：装备领回来词条不变
    S.returned = [];
    return { stones, items };
  }

  // ------------------------------------------------------------ NPC
  /** NPC 把用不着的东西挂出去（在 living.doTrade 里调）：东西押进楼，卖掉才有钱 */
  npcList(d: NpcData, id: string, n: number, loc: LocDef, rnd: () => number): void {
    const S = this.S, z = wbZoneOf(loc), it = itemDef(id);
    if (!tradable(it) || n <= 0) return;
    const zl = S.listings.filter((l) => l.zone === z);
    if (zl.length >= WANBAO.maxListings) { this.buyoutNow(d, id, n, z); return; }   // 楼里满了：直接按收购价收
    const gear = it.type === 'gear';
    const same = gear ? undefined : zl.find((l) => l.seller === d.id && l.item === id && l.n > 0);   // 装备每件词条不同，不并单
    const ref = this.ref(z, id);
    const k = d.faction === 'merchant' ? 1.02 + rnd() * 0.18 : d.pers === 'greedy' ? 1.05 + rnd() * 0.25 : 0.86 + rnd() * 0.26;
    const b = d.bag; if (!b?.[id]) return; const take = Math.min(n, b[id]);
    const af = gear ? this.game.stall?.gearOut(d, id, take) : undefined;   // 第六轮返工：装备挂进楼里带着它在摊主袋里的词条
    b[id] -= take; if (b[id] <= 0) delete b[id];
    if (same) { same.n += take; same.until = Math.max(same.until, this.game.day + 30); }
    else if (af?.length) { const until = this.game.day + 20 + Math.floor(rnd() * 25); for (let i = 0; i < take; i++) S.listings.push({ id: S.seq++, item: id, n: 1, price: Math.max(1, Math.round(ref * k)), seller: d.id, sellerName: d.name, zone: z, posted: this.game.day, until, ...(af[i] ? { affix: af[i] } : {}) }); }
    else S.listings.push({ id: S.seq++, item: id, n: take, price: Math.max(1, Math.round(ref * k)), seller: d.id, sellerName: d.name, zone: z, posted: this.game.day, until: this.game.day + 20 + Math.floor(rnd() * 25) });
    this.mark(z, id, 's', take);
  }
  private buyoutNow(d: NpcData, id: string, n: number, z: WbZone) {
    const b = d.bag; if (!b?.[id]) return; const take = Math.min(n, b[id]); b[id] -= take; if (b[id] <= 0) delete b[id];
    const v = this.buyPay(z, Math.round(this.ref(z, id) * this.buyoutK * take)); d.wealth += v; this.S.ledger.buyout += v; flow('buyout', v);
    this.mark(z, id, 'd', take * 0.5);   // 楼里收走拿去用（丹房、器坊）：算半份需求
  }
  /** NPC 先在楼里找货（在 living.doTrade 里调）：找到最便宜、出价之内的就买下一件，返回是否买到 */
  npcBuy(d: NpcData, id: string, maxPrice: number, loc: LocDef): boolean {
    const z = wbZoneOf(loc), day = this.game.day;
    let best: WbListing | null = null;
    for (const l of this.S.listings) if (l.zone === z && l.item === id && l.n > 0 && l.until > day && l.seller !== d.id && l.price <= maxPrice && (!best || l.price < best.price)) best = l;
    if (!best || d.wealth < best.price) return false;
    d.wealth -= best.price;
    if (best.affix) this.game.stall?.gearIn(d, id, [best.affix]);   // 第六轮返工：楼里买来的装备带着词条进他的袋（先接词条再加件数）
    const b = (d.bag ??= {}); b[id] = (b[id] ?? 0) + 1;
    if (isKeyPill(id)) tally('kpBuy');
    this.settle(best, 1, best.price);
    return true;
  }
  /**
   * NPC 贴求购（缺破境丹、疗伤丹、续命物）：出价押进楼；同一人同一物只贴一张。
   * loan（11e，只给卡在大境界瓶颈求破境丹的）：自己的钱不够，先向师长、同门借（见 LOAN），连自己的一起押进楼当定金；
   *   定金够出价的三成就贴「赊购」单（dep＝定金）：谁交了货，先拿定金（扣抽成），余款记成他借给求购人的账，求购人往后按月还。
   *   一个炼气修士连借带凑通常只有筑基丹行情的一两成，所以原来卡在「出得起全价才贴」，百年只贴出几张。
   * （赊的那一路不多取 rnd：求购期限用人和日子的哈希，原来的随机数次序不变）
   */
  npcOrder(d: NpcData, id: string, why: WbWhy, loc: LocDef, rnd: () => number, loan = false): void {
    const S = this.S, z = wbZoneOf(loc), day = this.game.day;
    if (S.orders.some((o) => o.buyer === d.id && o.item === id && o.n > 0 && o.until > day)) return;
    if (S.orders.filter((o) => o.zone === z && o.n > 0).length >= WANBAO.maxOrders) return;
    const ref = this.ref(z, id), urgent = why === '续命' ? 1.5 : why === '破境' ? 1.25 : 1.05;
    const price = Math.round(ref * urgent * (0.95 + rnd() * 0.3));
    let lent: [NpcData, number][] | null = null, dep = price;
    if (d.wealth < price) {
      if (!loan || why !== '破境' || d.realm < 1 || d.stage < REALMS[d.realm].stages.length - 1) return;
      const own = Math.max(0, Math.floor(d.wealth)), B = this.backers(d, price - own, z);
      dep = Math.min(price, own + B.got);
      if (dep < price * LOAN.dep) return;
      lent = B.got > 0 ? this.backers(d, dep - own, z).list : [];
      if (!lent) return;
    }
    const oid = S.seq++;
    if (lent?.length) this.lend(d, lent, oid);
    d.wealth -= dep;
    S.orders.push({ id: oid, item: id, n: 1, price, dep: dep < price ? dep : undefined, buyer: d.id, buyerName: d.name, why, zone: z, posted: day, until: day + 30 + (lent ? hash(d.id, Math.floor(day)) % 30 : Math.floor(rnd() * 30)) });
    if (why === '破境') tally('kpOrder');
    if (dep < price) tally('kpCredit');
    if (lent?.length) tally('kpLoan');
    this.mark(z, id, 'd', 1);
  }
  /** 押在这张求购里的钱（赊购单只押了定金） */
  held(o: WbOrder): number { return o.dep ?? o.n * o.price; }

  // ------------------------------------------------------------ 11e 赊丹
  /**
   * 谁肯借钱给 d 买破境丹：先师父、亲人、伴侣（各出留足口粮后身家的三成），再同宗同价区筑基以上的同门（各出一成五，从身家厚的借起；
   * 自己也卡在瓶颈攒钱的不借）。凑够 need 返回借款名单，凑不够 list 为空；got 是一共凑得出多少（拍卖会入座时估钱袋用）。不取随机数。
   */
  backers(d: NpcData, need: number, z: WbZone): { list: [NpcData, number][] | null; got: number } {
    const g = this.game, out: [NpcData, number][] = [];
    let got = 0;
    const take = (o: NpcData | undefined, frac: number) => {
      if (got >= need || !o?.alive || o === d || o.realm < 1 || out.some((x) => x[0] === o)) return;
      // 出借的人先留足自己的口粮（六十 × 三的境界次方，和还账时借款人留的一样），只借多出来的那部分
      const a = Math.floor(Math.min(need - got, Math.max(0, o.wealth - 60 * Math.pow(3, Math.max(0, o.realm - 1))) * frac));
      if (a > 0) { out.push([o, a]); got += a; }
    };
    for (const t of d.ties ?? []) if (t.k === 'master' || t.k === 'kin' || t.k === 'lover') take(g.npcs.byId.get(t.id), LOAN.kin);
    if (d.sect && got < need) {
      const saving = (m: NpcData) => !!KEY_PILL[m.realm] && m.stage >= REALMS[m.realm].stages.length - 1 && !m.bag?.[KEY_PILL[m.realm]];
      const mates = g.npcs.list.filter((m) => m.alive && m !== d && m.sect === d.sect && m.realm >= 2 && m.wealth > 0 && !saving(m) && wbZoneOf(LOC_BY_ID.get(m.home)) === z);
      mates.sort((a, b) => b.wealth - a.wealth || (a.id < b.id ? -1 : 1));
      for (const m of mates) { if (got >= need) break; take(m, LOAN.sect); }
    }
    return { list: got >= need && out.length ? out : null, got };
  }
  /** 借钱：灵石从出借人身上转到 d 身上，立借据（order：押在哪张求购里） */
  lend(d: NpcData, list: [NpcData, number][], order?: number): void {
    const L = (this.S.loans ??= []), day = Math.floor(this.game.day);
    for (const [o, a] of list) { o.wealth -= a; d.wealth += a; L.push({ from: o.id, to: d.id, v: a, day, order }); tally('loanV', a); }
  }
  /** 求购到期没收到货、押金退回：借来的钱当场还回去 */
  private unwind(oid: number): void {
    const L = this.S.loans; if (!L?.length) return;
    const by = this.game.npcs.byId;
    for (const l of L) {
      if (l.order !== oid) continue;
      const b = by.get(l.to), o = by.get(l.from);
      if (b?.alive && o?.alive) { const v = Math.max(0, Math.min(l.v, Math.floor(b.wealth))); b.wealth -= v; o.wealth += v; tally('unwindV', v); }
      l.v = 0;
    }
    this.S.loans = L.filter((l) => l.v > 0);
  }
  /** 求购收到了货：借据从「押着」变成要慢慢还的账 */
  private loanFilled(oid: number): void { let k = 0; for (const l of this.S.loans ?? []) if (l.order === oid) { l.order = undefined; k++; } if (k) tally('kpLoanUsed'); }
  /** 每月还账：借款人身上超出口粮（六十 × 三的境界次方）的部分拿两成五出来还 */
  private repay(): void {
    const L = this.S.loans; if (!L?.length) return;
    const by = this.game.npcs.byId;
    for (const l of L) {
      if (l.order !== undefined) continue;
      const b = by.get(l.to), hero = l.from === 'hero', o = hero ? undefined : by.get(l.from);
      if (!b?.alive || (!hero && !o?.alive)) { tally(!b?.alive ? 'lossV' : 'voidV', l.v); if (hero && !b?.alive) this.S.log.unshift({ day: Math.floor(this.game.day), text: `${b?.name ?? '欠账的人'}已不在人世，还欠你的 ${l.v} 灵石成了坏账` }); l.v = 0; continue; }
      const keep = 60 * Math.pow(3, Math.max(0, b.realm - 1));
      const v = Math.min(l.v, Math.floor(Math.max(0, b.wealth - keep) * LOAN.repay));
      if (v > 0) { b.wealth -= v; if (o) o.wealth += v; else this.S.payout += v; l.v -= v; tally('repV', v); }
    }
    this.S.loans = L.filter((l) => l.v > 0);
  }

  // ------------------------------------------------------------ 11e 宗门月俸
  /** 宗门的灵脉收入（每月）：门中修士人数 × perHead，至少 min */
  private sectIncome(sid: string): number {
    let n = 0; for (const d of this.game.npcs.list) if (d.alive && d.sect === sid && d.realm >= 1) n++;
    return Math.max(SECT_PAY.min, Math.round(n * SECT_PAY.perHead));
  }
  /** 门人做完差事领月俸：按境界、职位该领 want，宗门账上不够就只领到剩下的。返回实领 */
  sectPay(sid: string, want: number): number {
    const S = this.S, m = (S.sect ??= {});
    if (!Object.keys(m).length) for (const d of this.game.npcs.list) if (d.alive && d.sect && d.realm >= 1 && !m[d.sect]) { const inc = this.sectIncome(d.sect); m[d.sect] = { inc, t: inc * this.econK }; }
    let s = m[sid];
    if (!s) { const inc = this.sectIncome(sid); s = m[sid] = { inc, t: inc * this.econK }; }
    const v = Math.max(0, Math.min(Math.round(want), Math.floor(s.t)));
    s.t -= v;
    return v;
  }

  // ------------------------------------------------------------ 每几日撮合、每月结算
  /** 由 Game 的日结算调用 */
  daily(): void {
    const S = this.S, day = this.game.day;
    if (!S.seeded) { S.seeded = true; this.seed(); }
    if (day - S.lastTick >= WANBAO.tick) { S.lastTick = day; this.match(); }
    const m = Math.floor(day / 30);
    if (m !== S.lastMonth) { S.lastMonth = m; this.monthly(); }
  }
  /** 撮合：求购对上挂单；你的寄售按行情有人来买；过期的挂单 / 求购处置掉 */
  match(rnd: () => number = Math.random): void {
    const S = this.S, g = this.game, day = g.day;
    // 求购 × 挂单：按价格优先
    for (const o of S.orders) {
      if (o.n <= 0 || o.until <= day) continue;
      for (const l of S.listings) {
        if (o.n <= 0) break;
        if (l.n <= 0 || l.until <= day || l.zone !== o.zone || l.item !== o.item || l.price > o.price || l.seller === o.buyer) continue;
        const n = Math.min(o.n, l.n), cost = l.price * n;
        // 买家押的是出价，按挂单价成交：差价退给买家（11e 赊购单押的是定金：定金不够付的部分，卖家记成借给买家的账）
        const credit = o.dep !== undefined ? Math.max(0, cost - o.dep) : 0;
        const back = o.dep !== undefined ? Math.max(0, o.dep - cost) : (o.price - l.price) * n;
        if (o.buyer === 'hero') { S.payout += back; S.returned.push({ item: o.item, n }); g.toast(`万宝楼：你求购的${itemDef(o.item).name}收到 ${n} 件，待领。`, 'good'); }
        else { const d = g.npcs.byId.get(o.buyer); if (d?.alive) { d.wealth += back; const b = (d.bag ??= {}); b[o.item] = (b[o.item] ?? 0) + n; } if (o.why === '破境') { tally('kpOrderFill', n); this.loanFilled(o.id); } }
        o.n -= n;
        this.settle(l, n, cost);
        if (credit > 0) {
          if (l.seller === 'hero') S.payout -= credit; else { const sd = g.npcs.byId.get(l.seller); if (sd?.alive) sd.wealth -= credit; }
          (S.loans ??= []).push({ from: l.seller, to: o.buyer, v: credit, day: Math.floor(day) });
        }
        o.dep = undefined;
      }
    }
    // 你的寄售：价格越低于行情越快有人买（买家是这一价区里买得起的 NPC）
    for (const l of S.listings) {
      if (l.seller !== 'hero' || l.n <= 0 || l.until <= day) continue;
      const it = itemDef(l.item), ref = this.ref(l.zone, l.item, l.age), r = ref / l.price;
      const hot = it.type === 'pill' || it.type === 'talisman' ? 0.22 : it.type === 'herb' || it.type === 'material' ? 0.16 : 0.09;
      const p = Math.min(0.85, hot * Math.pow(r, 4) * (1 + Math.max(0, this.index(l.zone, l.item) - 1)));
      if (rnd() >= p) continue;
      const buyer = this.richIn(l.zone, l.price, rnd);
      if (!buyer) continue;
      const n = Math.min(l.n, 1 + Math.floor(rnd() * Math.min(3, l.n)));
      buyer.wealth -= l.price * n; const b = (buyer.bag ??= {}); b[l.item] = (b[l.item] ?? 0) + n;
      this.settle(l, n, l.price * n);
    }
    // 11e 灵舟求购：楼里没有现货时，价区里的行商托船坞造一条来交（出价够行情的九五折；每回撮合一成半的机会，
    // 按单号和日子的哈希定，不取随机数）。你押的钱九成给行商、一成抽成，船进待领
    for (const o of S.orders) {
      if (o.buyer !== 'hero' || o.n <= 0 || o.until <= day || !wbBoat(itemDef(o.item))) continue;
      if (o.price < this.ref(o.zone, o.item) * 0.95 || hash('lz' + o.id, Math.floor(day)) % 100 >= 15) continue;
      const ms = g.npcs.list.filter((d) => d.alive && d.faction === 'merchant' && d.realm >= 1 && wbZoneOf(LOC_BY_ID.get(d.home)) === o.zone);
      if (!ms.length) continue;
      const m = ms[hash('lzm' + o.id, 7) % ms.length], cost = o.price * o.n, fee = Math.round(cost * this.fee);
      m.wealth += cost - fee; S.ledger.fee += fee; S.ledger.trades++;
      this.mark(o.zone, o.item, 'n', o.n, cost);
      S.returned.push({ item: o.item, n: o.n });
      g.toast(`万宝楼：行商${m.name}托船坞造了${itemDef(o.item).name}，你求购的已到，待领。`, 'good');
      o.n = 0;
    }
    // 过期：你的货退回待领；NPC 的货楼里按四五折收走；求购的押金退回
    for (const l of S.listings) {
      if (l.n <= 0 || l.until > day) continue;
      if (l.seller === 'hero') { S.returned.push({ item: l.item, n: l.n, age: l.age, affix: l.affix }); g.toast(`万宝楼：你寄售的${itemDef(l.item).name}到期没卖掉，已退回，待领。`, 'info'); }
      else { const d = g.npcs.byId.get(l.seller); if (d?.alive) { const v = this.buyPay(l.zone, Math.round(this.ref(l.zone, l.item) * this.buyoutK * l.n)); d.wealth += v; flow('buyout', v); S.ledger.buyout += v; } this.mark(l.zone, l.item, 'd', l.n * 0.5); }
      l.n = 0;
    }
    for (const o of S.orders) {
      if (o.n <= 0 || o.until > day) continue;
      if (o.buyer === 'hero') S.payout += o.n * o.price; else { const d = g.npcs.byId.get(o.buyer); if (d?.alive) d.wealth += this.held(o); this.unwind(o.id); }
      o.n = 0;
    }
    S.listings = S.listings.filter((l) => l.n > 0);
    S.orders = S.orders.filter((o) => o.n > 0);
  }
  /**
   * 收滞销货付多少：这个月这一价区的预算之内按行情折扣，超出的只付一成。
   * 11e：预算也跟着折扣缩放（折扣压到默认的几成，预算就是几成）——这条进水口一年近二十万，几乎月月把预算用光，
   * 原来只压折扣、预算不变，压低了折扣不过是同样的预算多收几件货，进水口不减，调节就一路把折扣压到底、抽成顶到头，最后只能减灵脉产出
   */
  private buyPay(z: WbZone, v: number): number {
    const S = this.S, b = (S.bud ??= {});
    if (b[z] === undefined) b[z] = WANBAO.budget * this.econK * (this.buyoutK / WANBAO.buyout) * (z.startsWith('realm-') ? 0.3 : 1);
    const inBud = Math.min(v, Math.max(0, b[z])); b[z] -= inBud;
    return Math.round(inBud + (v - inBud) * 0.1);
  }
  /** 这一价区里买得起的一个 NPC */
  private richIn(z: WbZone, price: number, rnd: () => number): NpcData | null {
    const list = this.game.npcs.list;
    for (let t = 0; t < 24; t++) {
      const d = list[Math.floor(rnd() * list.length)];
      if (!d?.alive || d.realm <= 0 || d.wealth < price * 1.3) continue;
      const L = LOC_BY_ID.get(d.home); if (!L || wbZoneOf(L) !== z) continue;
      return d;
    }
    return null;
  }
  /** 月底：按这个月的供需调行情、记成交均价 */
  monthly(): void {
    const S = this.S;
    for (const [k, m] of Object.entries(S.month)) {
      const supply = m.s, demand = m.d + m.n * 0.5;
      let x = S.idx[k] ?? 1;
      x *= 1 + 0.18 * (demand - supply) / (demand + supply + 2);
      x += (1 - x) * WANBAO.idxDrift;
      S.idx[k] = Math.max(WANBAO.idxMin, Math.min(WANBAO.idxMax, x));
      if (m.n > 0) { const h = (S.hist[k] ??= []); h.push(Math.round(m.v / m.n)); if (h.length > 12) h.shift(); }
    }
    for (const k of Object.keys(S.idx)) if (!S.month[k]) { S.idx[k] += (1 - S.idx[k]) * WANBAO.idxDrift; if (Math.abs(S.idx[k] - 1) < 0.01) delete S.idx[k]; }
    S.month = {}; S.bud = {};
    // 11e：各宗门这个月的灵脉收入入账（随总账的灵脉倍数浮动；最多存一年）
    for (const s of Object.values(S.sect ?? {})) s.t = Math.min(s.inc * SECT_PAY.store, s.t + s.inc * this.econK);
    this.repay();
    this.regulate();
  }

  /**
   * 总账的自动调节（每月一次）：看「修士平均身上有多少灵石」相对开局第一年的水平——
   *   高了一成以上：灵脉产出（宗门月俸、耕作营生）少一点、成交抽成多一点、滞销收购的折扣压低一点；低了一成以上反过来；在范围内就慢慢回到默认值。
   *   每月只动一小步、各有上下限，不会突然剧变。
   * 另有身家上限：同阶修士（和凡人）里富得出奇的，每月把超出部分的两成花掉（开府、收徒、供奉宗门、买延寿灵物；凡人置地、嫁娶）——灵石离开世界。
   * 百年模拟器（tools/sim-economy.ts）据此验收：人均存量 0.67–1.5 倍、物价中位数 0.8–1.25、人口金字塔不偏。
   */
  regulate(): void {
    const g = this.game, S = this.S;
    const e = (S.econ ??= { k: 1, fee: WANBAO.fee, buyout: WANBAO.buyout, base: 0, hist: [] });
    // 身家上限
    for (const d of g.npcs.list) {
      if (!d.alive || !Number.isFinite(d.wealth)) continue;
      // 凡人也算：他们耕作、卖草药挣灵石却从不花（模拟里凡人人均从 67 涨到 1100），攒多了置地、嫁娶、供奉香火
      const cap = (d.realm <= 0 ? 400 : 300 * Math.pow(4, Math.min(5, d.realm))) * (d.faction === 'merchant' ? 3 : 1);
      if (d.wealth > cap) { const v = Math.round((d.wealth - cap) * 0.2); d.wealth -= v; flow('splurge', -v); }
    }
    if (ECON.noRegulate) return;
    const per = moneySupply(g).perHead;
    e.hist.push(Math.round(per)); if (e.hist.length > 36) e.hist.shift();
    if (!e.base) { if (e.hist.length >= 12) e.base = e.hist.slice(-12).reduce((a, b) => a + b, 0) / 12; return; }
    // 按偏离多少成比例地动，先动滞销收购的折扣（最大的进水口），再动抽成，两样都到头了才动灵脉产出（宗门月俸、耕作——会影响修士买不买得起破境丹）
    const r = per / e.base, err = r - 1, clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
    if (Math.abs(err) < 0.08) { e.k += (1 - e.k) * 0.03; e.fee += (WANBAO.fee - e.fee) * 0.03; e.buyout += (WANBAO.buyout - e.buyout) * 0.03; return; }
    const step = clamp(err, -0.3, 0.3) * 0.1;
    const b0 = e.buyout, f0 = e.fee;
    e.buyout = clamp(e.buyout - step * 0.6, 0.25, 0.55);
    e.fee = clamp(e.fee + step * 0.15, 0.06, 0.18);
    const stuck = (step > 0 && b0 <= 0.2501 && f0 >= 0.1799) || (step < 0 && b0 >= 0.5499 && f0 <= 0.0601);
    if (stuck || (step < 0 && e.k < 1)) e.k = clamp(e.k * (1 - step * 0.6), 0.6, 1.3);
  }

  /** 新开局：各价区先摆一批货、贴几张求购（来自各地真实存在的 NPC，开张不至于空荡荡） */
  seed(rnd: () => number = Math.random): void {
    const g = this.game;
    for (const d of g.npcs.list) {
      if (!d.alive || d.realm <= 0 || rnd() > 0.5) continue;
      const L = LOC_BY_ID.get(d.home); if (!L) continue;
      g.living?.ensure(d);   // 身家是用到时才生成的
      if (!d.bag) continue;
      for (const [id, n] of Object.entries(d.bag)) {
        const it = itemDef(id);
        if (it.type === 'artifact' && Object.keys(d.bag).filter((k) => itemDef(k).type === 'artifact').length > 1 && rnd() < 0.5) { this.npcList(d, id, 1, L, rnd); continue; }
        if (it.type === 'herb' || it.type === 'material' || (it.type === 'pill' && n > 1) || (it.type === 'talisman' && n > 2)) this.npcList(d, id, it.type === 'pill' ? n - 1 : it.type === 'talisman' ? n - 2 : n, L, rnd);
      }
      const kp = KEY_PILL[d.realm];
      if (kp && d.stage >= REALMS[d.realm].stages.length - 1 && !d.bag[kp] && rnd() < 0.5) this.npcOrder(d, kp, '破境', L, rnd);
    }
  }
}
void ITEM_LIST; void ACTIVE_MAP;
