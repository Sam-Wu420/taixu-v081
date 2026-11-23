// 收官 D（甲）：NPC 摆摊——谁摆、摆哪、卖什么、怎么买卖，以及头顶的小招牌。
//
// · 谁摆、摆哪：商人、贪财的散修、打算「赶集买卖」的人，在有集市的大城里坐到集市的摊位点上（cityLayout.market 导出的
//   mkt* 锚点）摆一整个集期（一月：光阴一息半日，按日换摊主太快）；小镇没有集市，就坐在坊市铺子门口。选人、排座位都按「人 + 日子」取种子，用这里自带的随机序列。
//   ※ 日结算（npcs.daily、living.step、doTrade……）和布局生成的路径上一个 Math.random / 布局随机数都不多取：
//     这里只在你人在城里时（每帧的路径上）读 NPC 的状态；选人、排座、给摊主袋里放装备、摇词条全用自己的种子。
// · 卖真东西：货来自摊主自己的储物袋（living.ensure 之后的 d.bag），价钱 = 万宝楼行情 × 摊主性情的系数；买下走 living.sold——
//   货从他袋里扣、灵石进他的身家。总账（econ.flow）只记一笔「转手」（stall），不新开进水口。
// · 掺假与掌眼照旧（renxin.injectStallFakes / probeShopItem）；还价一次（好感、口才定成败）；也能卖东西给他（上限是他的身家）。
// · 装备：有的摊主袋里有几件低阶装备；NPC 的袋子只记 id → 数量，词条另记在 ws.flags.stall.gear 里，买卖时跟着走。
// · 头顶招牌：画在界面层（照 render.drawBuildingNames 的办法，屏幕上大小恒定、互相避让、避开主角、远了淡出、悬停高亮）——
//   模组整个替换 NPC 的画法也不会丢。点招牌：近了直接开摊位窗口，远了先走过去（复用 game.pendingTalk）。
import type { Game } from './game';
import type { Active, NpcData } from './npc';
import type { ShopStock, FakeKind } from './modal';
import * as C from './cultivation';
import { flow } from './econ';
import { wbZoneOf, tradable } from './wanbao';
import { KEY_PILL } from './living';
import { itemDef, ITEMS } from '../data/items';
import { sellableAt, zoneOfLoc } from '../data/market';
import { rollAffixes, gearDropId, weaponDrop, type Affix } from '../data/gear';
import { armsHash } from './arms';
import { REALMS, realmName } from '../data/realms';
import { LOC_BY_ID, locsOf, ACTIVE_MAP, WORLD_SCALE, type LocDef } from '../data/world';
import { getLayout, LOC_SCALE } from '../gfx/building';
import { mulberry32 } from '../core/rng';
import { modx } from '../mod/hooks';
import type { HdScene } from '../hd2d/scene';
import { hudRects } from '../core/hudzones';   // 收官 H3：招牌避让 HUD

/** a.life.n 上的记号：是摊位系统让他坐下的（日子换了、不再摆了就收摊） */
export const STALL_MARK = 7771;
/** 主营的货：丹、符（含功法玉简）、器（法器、装备）、药（灵草、材料）、杂 */
export type Ware = 'dan' | 'fu' | 'qi' | 'yao' | 'za';
export const WARE_GLYPH: Record<Ware, string> = { dan: '丹', fu: '符', qi: '器', yao: '药', za: '杂' };
/** npc.ts 里 drawStall 画布摊时用的货色编号（0 丹 1 符 2 药 3 器 4 杂） */
const WARE_IDX: Record<Ware, number> = { dan: 0, fu: 1, yao: 2, qi: 3, za: 4 };

/** 一格货 */
export interface StallGood {
  key: string; id: string; n: number;
  /** 开价、行情价（万宝楼） */
  price: number; ref: number;
  age?: number; affix?: Affix[];
  /** 掺的假货（不在他袋里，是 injectStallFakes 编的） */
  fake?: FakeKind; ident?: boolean; origPrice?: number;
  /** 掌过眼、还过价（ok 让了利 / fail 砸了，这件不卖你了） */
  probed?: boolean; hag?: 'ok' | 'fail';
  /** 装备：词条在副表里的序号 */
  gi?: number;
}
export interface StallInfo { d: NpcData; name: string; ware: Ware; shout: string; urgent: boolean; seat?: { x: number; y: number }; loc?: LocDef }

interface StallFlags {
  day: number;
  /** 当天编进货里的假货（按摊主） */
  fk: Record<string, ShopStock[]>;
  /** 当天的还价结果（摊主|货的 key） */
  hag: Record<string, 'ok' | 'fail'>;
  probed: Record<string, 1>;
  /** 试玩入口请来的摊主：谁 → 在哪、摆到哪天 */
  inv: Record<string, { loc: string; until: number }>;
  /** 已经往袋里放过装备的摊主 */
  stocked: Record<string, 1>;
  /** 摊主袋里装备的词条：摊主 → 物品 → 每件一份 */
  gear: Record<string, Record<string, Affix[][]>>;
  /** 11e 摊主这一集期进过货没有（摊主 → 集期） */
  rs?: Record<string, number>;
}

// ---------------------------------------------------------------- 小工具
/** 32 位整数混合（不取 Math.random） */
function mix(a: number, b = 0, c = 0): number {
  let x = (a | 0) ^ Math.imul(b | 0, 0x9e3779b1) ^ Math.imul(c | 0, 0x85ebca77);
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b); x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return (x ^ (x >>> 16)) >>> 0;
}
const strHash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const pick = <T,>(a: T[], r: number) => a[Math.floor(r * a.length) % a.length];

// ---------------------------------------------------------------- 摊名、吆喝
const NAME_PAT: Record<Ware, string[]> = {
  dan: ['{姓}记丹摊', '{姓}家灵丹', '回春小丹摊', '一炉香丹摊', '九转丹摊', '{名}氏丹铺', '杏林丹摊'],
  fu: ['{姓}记符摊', '朱砂符箓', '一纸千雷', '{姓}氏符箓', '玉简杂说', '青符小摊', '{名}家符纸'],
  qi: ['{姓}记器摊', '百炼小铺', '{姓}家法器', '寒铁兵摊', '淬锋器摊', '{名}氏器坊', '流火器摊'],
  yao: ['{姓}记药摊', '百草摊', '采药人{姓}', '灵草小摊', '{姓}家药圃', '山中百味', '{名}氏草堂'],
  za: ['{姓}记杂货', '百宝杂货摊', '万物皆可摊', '{姓}家杂货', '随缘小摊', '{名}的旧货', '聚宝小摊'],
};
const SHOUT_WARE: Record<Ware, string[]> = {
  dan: ['上好的丹药，童叟无欺！', '丹香扑鼻，一闻便知是真货！', '闭关冲关，少不得几枚好丹！', '刚出炉的丹，还带着火气呢！', '服一粒，修为蹭蹭往上涨！', '疗伤回气，样样都有！'],
  fu: ['新画的符箓，朱砂未干！', '一张雷符，保你一命！', '玉简功法，看了不亏！', '符纸灵墨，张张灵验！', '出门在外，身上总得揣几张符！', '护身遁地，符到病除！'],
  qi: ['趁手的法器，来看看！', '寒铁打的，砍山石不卷刃！', '好器配好人，道友试试手感？', '护腕戒指，穿上就是不一样！', '祭炼过的法器，拿去就能用！', '器灵已通，识货的来！'],
  yao: ['百年灵草，走过路过莫错过！', '山里刚采的，根须还带着土！', '炼丹的药引，这儿全！', '灵草论年份，年份都写着呢！', '妖丹兽骨，炼器炼丹都使得！', '深山老药，错过再等十年！'],
  za: ['杂七杂八，总有你用得上的！', '旧货新货，看看不要钱！', '东西不多，件件都有来历！', '翻一翻，说不定就捡着漏了！', '缺什么？这儿说不定就有！', '小摊虽小，五脏俱全！'],
};
const SHOUT_PERS: Record<string, string[]> = {
  greedy: ['一分钱一分货，嫌贵别看！', '今日不还价，爱买不买！', '这价钱，别家可拿不到这成色！'],
  ruthless: ['买定离手，出了这条街概不认账。', '看好了再掏灵石，我这儿不退。', '嫌贵？那是你眼力不行。'],
  arrogant: ['识货的自然懂，不识货的别挡道。', '这等货色，寻常坊市见不着。', '本座的东西，还用吆喝？'],
  cautious: ['货都验过，真金不怕火炼。', '慢慢挑，挑仔细了再说。', '有疑心的，尽管掌眼。'],
  kind: ['童叟无欺，看看不买也无妨。', '道友慢慢看，不急不急。', '新来的道友，给你算便宜些。'],
  righteous: ['价钱公道，假一赔十！', '明码实价，绝不欺客！', '凭良心做买卖！'],
  aloof: ['……随缘。', '有缘者自取。', '东西都在这儿，自己看吧。'],
};
const SHOUT_URGENT = ['急用灵石，全场让利！', '清仓甩卖，过了今日不候！', '凑一枚破境丹的钱，便宜卖了！', '急着赶路，贱卖贱卖！'];

/** 价钱的性情系数：贪的贵、温和的便宜 */
const SELL_MUL: Record<string, number> = { greedy: 1.35, ruthless: 1.2, arrogant: 1.18, cautious: 1.06, righteous: 1, aloof: 0.97, kind: 0.9 };
/** 收你东西的折扣：贪的压价狠 */
const BUY_MUL: Record<string, number> = { greedy: 0.42, ruthless: 0.45, arrogant: 0.5, cautious: 0.52, righteous: 0.56, aloof: 0.55, kind: 0.62 };
/** 还价的脾气：好说话的容易让 */
const HAG_PERS: Record<string, number> = { kind: 0.15, righteous: 0.05, aloof: 0, cautious: -0.02, arrogant: -0.08, ruthless: -0.12, greedy: -0.15 };
const TYPE_ORDER: Record<string, number> = { gear: 0, artifact: 1, pill: 2, scroll: 3, talisman: 4, herb: 5, material: 6, misc: 9 };
/** 一个集期多少天：光阴一息半日，「一天」太短（摊主两息一换），按月逢集——摊主、当期的假货、还价都按集期算 */
export const STALL_DAYS = 30;
/** 摊位最多摆几格 */
export const STALL_CELLS = 24;

/** 招牌摆放：屏幕矩形 [左, 上, 右, 下] */
export type SignRect = [number, number, number, number];
export interface SignPlace { r: SignRect; cost: number; moved: boolean }
/**
 * 第五轮：给一块 w×h 的招牌找地方。(sx, sy) 是摊主头顶（招牌尾巴尖默认对着它）。
 * hard：接点击的界面（压上去就点不到，绝不压）；soft：只显示不接点击的界面（尽量不压）；block：别的招牌、主角（不压）。
 * 候选位置由近到远：原位 → 往上一两格 → 左右 → 往下（脚边）→ 再远一圈的八个方向；每个先夹进画面（四边留 4 像素）。
 * 返回代价最小的那个（离原位越远、压着 soft 越多代价越大）；全都不行返回 null。
 */
export function placeSign(sx: number, sy: number, w: number, h: number, W: number, H: number, hard: SignRect[], soft: SignRect[], block: SignRect[]): SignPlace | null {
  const ov = (a: SignRect, q: SignRect) => Math.max(0, Math.min(a[2], q[2]) - Math.max(a[0], q[0])) * Math.max(0, Math.min(a[3], q[3]) - Math.max(a[1], q[1]));
  const bx = sx - w / 2, by = sy - h;
  const offs: [number, number][] = [[0, 0], [0, -(h * 0.62 + 3)], [0, -(h * 1.24 + 6)], [-(w * 0.6 + 8), 0], [w * 0.6 + 8, 0], [0, h + 40],
    [-(w * 0.6 + 8), -(h * 0.62 + 3)], [w * 0.6 + 8, -(h * 0.62 + 3)], [-(w + 16), h * 0.5], [w + 16, h * 0.5]];
  for (const R of [110, 190, 280]) for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2 - Math.PI / 2; offs.push([Math.cos(a) * R * 1.2, Math.sin(a) * R * 0.8]); }
  let best: SignPlace | null = null;
  for (const [dx, dy] of offs) {
    const x0 = Math.max(4, Math.min(W - w - 4, bx + dx)), y0 = Math.max(4, Math.min(H - h - 4, by + dy));
    if (W - w < 8 || H - h < 8) return null;
    const r: SignRect = [x0, y0, x0 + w, y0 + h];
    if (hard.some((q) => ov(r, q) > 0) || block.some((q) => ov(r, q) > 0)) continue;
    const mx = x0 - bx, my = y0 - by, d = Math.hypot(mx, my);
    let cost = d / 40 + (my > 0 ? my / 60 : 0);   // 往下挪（盖住摊主自己）多算一点
    for (const q of soft) cost += ov(r, q) / (w * h) * 6;
    if (!best || cost < best.cost) best = { r, cost, moved: d > 40 };
    if (cost < 0.05) break;   // 原位就放得下
  }
  return best;
}

export class StallSys {
  /** 当前所在的有摊位的地点、今天这里的摊主（id → 座位）、它们是哪天算的 */
  private cur: { loc: LocDef; day: number; seats: Map<string, { x: number; y: number }> } | null = null;
  private seatCache = new Map<string, { x: number; y: number }[]>();
  private snapped = new Set<string>();
  private scanT = 0;
  /** 点了招牌、正走过去的摊主 */
  pendingOpen: string | null = null;
  /** 模组 shop 钩子改过的价钱 / 拿掉的货（开窗口时那一份） */
  modView: { npc: string; price: Map<string, number>; hide: Set<string> } | null = null;
  /** 招牌的屏幕框（点击判定）、鼠标位置、招牌出现的时刻 */
  private hits: { id: string; x0: number; y0: number; x1: number; y1: number }[] = [];
  private mouse = { x: -9999, y: -9999, on: false };
  private born = new Map<string, number>();
  private spr = new Map<string, HTMLCanvasElement>();
  constructor(private readonly game: Game) {
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('pointermove', (e: PointerEvent) => { if (e.pointerType === 'mouse') { this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.on = true; } });
    }
  }

  /** 当前集期（第几个月） */
  period(day = this.game.day) { return Math.floor(day / STALL_DAYS); }
  // ------------------------------------------------------------ 存档里的当期状态
  get F(): StallFlags {
    const f = this.game.ws.flags as Record<string, unknown>;
    const s = (f.stall ??= { day: -1, fk: {}, hag: {}, probed: {}, inv: {}, stocked: {}, gear: {} }) as StallFlags;
    s.stocked ??= {}; s.gear ??= {}; s.inv ??= {};
    const day = this.period();
    if (s.day !== day) { s.day = day; s.fk = {}; s.hag = {}; s.probed = {}; }
    return s;
  }

  // ------------------------------------------------------------ 摊位点
  /** 一处地点的摊位点（世界坐标）：大城取集市的 mkt* 锚点；小镇取坊市铺子门口两侧 */
  seatsOf(l: LocDef): { x: number; y: number }[] {
    let s = this.seatCache.get(l.id);
    if (s) return s;
    s = [];
    const L = getLayout(l) as { anchors?: Record<string, { x: number; y: number }>; doors?: { x: number; y: number; fn?: string }[] };
    const ox = l.x * WORLD_SCALE, oy = l.y * WORLD_SCALE;
    for (const [k, v] of Object.entries(L.anchors ?? {})) if (k.startsWith('mkt')) s.push({ x: ox + v.x * LOC_SCALE, y: oy + v.y * LOC_SCALE });
    if (!s.length) for (const d of L.doors ?? []) if (d.fn === 'market') for (const dx of [-120, 120]) s.push({ x: ox + (d.x + dx) * LOC_SCALE, y: oy + (d.y + 70) * LOC_SCALE });
    this.seatCache.set(l.id, s);
    return s;
  }
  /** 有摊位点的城镇半径（世界单位） */
  private radius(l: LocDef) { const L = getLayout(l); return Math.max(3000, (L.gw ?? 4000) * LOC_SCALE * 0.45); }
  /** 主角此刻在哪座有摊位点的城镇里 */
  private whereNow(): LocDef | null {
    const p = this.game.player;
    for (const l of locsOf(ACTIVE_MAP)) {
      if (l.type !== 'city' && l.type !== 'town' && l.type !== 'isle') continue;
      const dx = l.x * WORLD_SCALE - p.x, dy = l.y * WORLD_SCALE - p.y;
      if (Math.abs(dx) > 30000 || Math.abs(dy) > 30000) continue;
      if (Math.hypot(dx, dy) > this.radius(l)) continue;
      if (this.seatsOf(l).length) return l;
    }
    return null;
  }

  // ------------------------------------------------------------ 谁摆
  /** 这个人今天想不想出摊的几率（只看身份、性情、打算） */
  private want(d: NpcData): number {
    if (d.faction === 'merchant') return 0.85;
    if (d.plan?.k === 'trade') return 0.7;
    if (d.faction === 'rogue' && d.pers === 'greedy') return 0.6;
    if (d.faction === 'rogue' && this.urgent(d) && d.pers !== 'aloof') return 0.3;   // 急用钱的散修也来摆一摆
    if ((d.faction === 'rogue' || d.faction === 'sect') && d.pers !== 'aloof') return 0.2;
    return 0;
  }
  /** 一个人赶集去哪：离他家最近的有集市的大城（三百二十里内，赶集）；没有就近处有坊市的小镇。每个人只归一处，同一天不会两处都摆 */
  private mktCache = new Map<string, string | null>();
  marketOf(home: string): LocDef | null {
    let id = this.mktCache.get(home);
    if (id === undefined) {
      const h = LOC_BY_ID.get(home); id = null;
      if (h) {
        let best = Infinity;
        for (const l of locsOf(h.map)) {
          if (l.type !== 'city' && l.type !== 'town' && l.type !== 'isle') continue;
          const dd = Math.hypot(l.x - h.x, l.y - h.y), big = this.seatsOf(l).length >= 6;
          if (!this.seatsOf(l).length || dd > (big ? 320 : 25)) continue;
          const score = dd - (big ? 1000 : 0);   // 够得着大城的集市就去大城（热闹、好卖）
          if (score < best) { best = score; id = l.id; }
        }
      }
      this.mktCache.set(home, id);
    }
    return id ? LOC_BY_ID.get(id) ?? null : null;
  }
  private eligible(d: NpcData) {
    return d.alive && d.realm >= 1 && !d.hidden && !d.canon && !d.beauty && !d.bond && !d.hunting && !d.chasing && !d.gz && !d.ros && !d.mod && d.faction !== 'mortal' && d.faction !== 'demon' && (d.map ?? 'tiannan') === ACTIVE_MAP;
  }
  /**
   * 某地某天的摊主与座位：按「人 + 日子」掷一次，按掷出的数排先后，依次坐进按「地点 + 日子」洗过的摊位点。
   * 只读 NPC 的状态，不取 Math.random。
   */
  keepersAt(l: LocDef, day = this.period()): Map<string, { x: number; y: number }> {
    const seats = this.seatsOf(l); const out = new Map<string, { x: number; y: number }>();
    if (!seats.length) return out;
    const R = this.radius(l), ox = l.x * WORLD_SCALE, oy = l.y * WORLD_SCALE;
    const cand: { d: NpcData; r: number }[] = [];
    for (const d of this.game.npcs.list) {
      if (!this.eligible(d)) continue;
      const p = this.want(d); if (p <= 0) continue;
      if (this.marketOf(d.home)?.id !== l.id && Math.hypot(d.x - ox, d.y - oy) > R * 1.3) continue;
      const r = mix(d.seed, day, 0x5a11) / 4294967296;
      if (r < p) cand.push({ d, r });
    }
    for (const [id, v] of Object.entries(this.F.inv)) { if (v.loc !== l.id || v.until < day) continue; const d = this.game.npcs.byId.get(id); if (d?.alive && !cand.some((c) => c.d === d)) cand.push({ d, r: -1 }); }
    cand.sort((a, b) => a.r - b.r || (a.d.id < b.d.id ? -1 : 1));
    // 摊位点：大城有两三处集市，当天先坐满一处（热闹），再往别处排；各处里面按「地点 + 日子」洗一遍（自带的随机序列）
    const rnd = mulberry32(mix(strHash(l.id), day, 0x5ea7));
    const groups = this.marketsOf(l), first = Math.floor(rnd() * groups.length);
    const order: number[] = [];
    for (let k = 0; k < groups.length; k++) { const gi = groups[(first + k) % groups.length].slice(); for (let i = gi.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [gi[i], gi[j]] = [gi[j], gi[i]]; } order.push(...gi); }
    const cap = Math.min(seats.length, 16);
    for (let i = 0; i < cand.length && i < cap; i++) out.set(cand[i].d.id, seats[order[i]]);
    return out;
  }
  /** 试玩入口用：请某人这几天在这里摆摊 */
  invite(d: NpcData, l: LocDef, periods = 2) { this.F.inv[d.id] = { loc: l.id, until: this.period() + periods - 1 }; if (this.cur?.loc.id === l.id) this.cur = null; }
  /** 一座城的几处集市：摊位点按远近聚成几堆（两千五以内算一处），返回每堆的摊位点下标 */
  private mktGroups = new Map<string, number[][]>();
  marketsOf(l: LocDef): number[][] {
    let gs = this.mktGroups.get(l.id); if (gs) return gs;
    const seats = this.seatsOf(l); gs = [];
    for (let i = 0; i < seats.length; i++) { const g = gs.find((x) => x.some((j) => Math.hypot(seats[j].x - seats[i].x, seats[j].y - seats[i].y) < 2500)); if (g) g.push(i); else gs.push([i]); }
    this.mktGroups.set(l.id, gs); return gs;
  }
  /** 试玩入口用：今天的摊主一律直接坐到摊位上（平时人在眼前就自己走过去） */
  settle() { if (!this.cur) return; for (const [id, s] of this.cur.seats) { const d = this.game.npcs.byId.get(id); if (!d) continue; d.x = d.tx = s.x; d.y = d.ty = s.y; const a = this.game.npcs.active.get(id); if (a) { a.st.x = s.x; a.st.y = s.y; } this.snapped.add(id + '@' + this.cur.day); } }
  /** 今天他坐哪（不是摊主返回 undefined） */
  seatOf(d: NpcData) { return this.cur?.seats.get(d.id); }
  isKeeper(d: NpcData) { return !!this.cur?.seats.has(d.id); }
  /** 当前城里今天的摊主（id 列表） */
  keepers(): string[] { return this.cur ? [...this.cur.seats.keys()] : []; }
  get loc(): LocDef | null { return this.cur?.loc ?? null; }

  // ------------------------------------------------------------ 每帧
  tick(dt: number) {
    const g = this.game;
    this.scanT -= dt;
    if (this.scanT <= 0) {
      this.scanT = 0.6;
      const day = this.period();
      const l = g.offWorld ? null : this.whereNow();
      if (!l) this.cur = null;
      // 人还在这座城里就不换摊主（光阴走得快：一日只有两息，逛着逛着集期过了，摊主也不会当着你的面收摊走人）
      else if (!this.cur || this.cur.loc.id !== l.id) {
        const seats = this.keepersAt(l, day);
        this.cur = { loc: l, day, seats };
        // 不在眼前的摊主：当作一早就来了，直接坐到摊位上（不在眼前，不会看见人「瞬移」）
        for (const [id, s] of seats) {
          const d = g.npcs.byId.get(id); if (!d) continue;
          this.stock(d);
          const key = id + '@' + day; if (this.snapped.has(key)) continue;
          if (!g.npcs.active.has(id)) { d.x = d.tx = s.x; d.y = d.ty = s.y; this.snapped.add(key); }
        }
      }
    }
    // 点了招牌走过去：人一动（方向键）pendingTalk 就清了，这边也跟着取消
    if (this.pendingOpen && g.pendingTalk !== this.pendingOpen) this.pendingOpen = null;
  }

  /**
   * npc.ts 的 behave 在「日常」那一段先问这里：今天是摊主的，走到摊位上坐下，坐着就由这里管（返回 true）。
   * 不是摊主、或上一天摆过今天不摆了：收摊（返回 false，照常走）。
   */
  hold(a: Active, dt: number): boolean {
    let seat = this.cur?.seats.get(a.d.id);
    if (!seat || a.act === 'follow' || a.duel || a.enemy) {
      if (a.life?.n === STALL_MARK) { a.life = undefined; a.wait = 0; }
      return false;
    }
    // 城镇破坏（world/townwreck.ts）：摊子刚被砸——惊叫一声顺着过道跑开；砸了还没修好——回来站在摊子旁边接着卖
    const tw = this.game.combat?.wreck?.town.stallAt(seat.x, seat.y);
    const A = a as Active & { _twPanic?: boolean };
    if (tw?.s === 'panic') {
      if (!A._twPanic) { A._twPanic = true; a.bubble = { text: (['哎哟！我的摊子！', '杀人啦——快跑！', '我的货！我的货啊！'])[Math.abs(Math.round(seat.x)) % 3], t: 2.2 }; if (a.life?.n === STALL_MARK) a.life = undefined; }
      const side = (tw.t && seat.x < tw.t.x) || Math.round(seat.y) % 2 ? -1 : 1;
      a.d.tx = seat.x + side * 420; a.d.ty = seat.y + 20; a.wait = 0;
      return false;
    }
    if (A._twPanic) A._twPanic = false;
    if (tw?.s === 'broken') seat = { x: seat.x + 74, y: seat.y + 14 };
    const standing = tw?.s === 'broken';
    const st = a.st, d = a.d, dd = Math.hypot(seat.x - st.x, seat.y - st.y);
    const key = d.id + '@' + this.cur!.day;
    if (dd > 45) {
      const p = this.game.player;
      if (!this.snapped.has(key) && dd > 300 && Math.hypot(st.x - p.x, st.y - p.y) > 1300) { st.x = seat.x; st.y = seat.y; this.snapped.add(key); }
      else {
        if (a.life?.n === STALL_MARK) a.life = undefined;
        d.tx = seat.x; d.ty = seat.y;
        if (a.wait > 0 && a.act !== 'walk') a.wait = 0;
        return false;
      }
    }
    this.snapped.add(key);
    st.x = seat.x; st.y = seat.y; d.x = d.tx = seat.x; d.y = d.ty = seat.y; (a as { path?: unknown }).path = undefined;
    a.act = 'sit'; a.wait = Math.max(a.wait, 0.5);
    if (!a.life || a.life.n !== STALL_MARK) a.life = { k: 'stall', dir: Math.PI / 2, ware: WARE_IDX[this.wareOf(d)], n: STALL_MARK };
    st.speed = 0; st.lift += (0 - st.lift) * Math.min(1, dt * 3);
    st.faceToward(standing ? -1 : 0, 1); st.setAction(standing ? 'idle' : 'sit'); st.update(dt);
    return true;
  }

  // ------------------------------------------------------------ 货
  /** 摊主袋里放几件低阶装备（只放一次；自己的种子）；每个集期出摊前去万宝楼进一回货（restock） */
  private stock(d: NpcData) {
    const g = this.game, F = this.F;
    g.living.ensure(d);
    this.restock(d);
    if (F.stocked[d.id]) return;
    F.stocked[d.id] = 1;
    // 近战兵器线：行商、散修的摊上偶尔有一件兵器（按摊主种子另算哈希、词条用自己的种子——下面摇装备的随机数一个不多取）
    { const wx = armsHash(d.seed, 0x5a11), pw = d.faction === 'merchant' ? 0.45 : d.faction === 'rogue' ? 0.2 : 0.08;
      if ((wx % 1000) / 1000 < pw) { const wd = weaponDrop(wx, clamp(d.realm - 1 + ((wx >>> 12) % 2), 0, 3), 1); if (wd) { g.living.give(d, wd.id, 1); ((F.gear[d.id] ??= {})[wd.id] ??= []).push(wd.affix); } } }
    const rnd = mulberry32(mix(d.seed, 0x6ea2, 0x51a11));
    const p = d.faction === 'merchant' ? 0.7 : 0.35;
    if (rnd() >= p) return;
    const n = 1 + Math.floor(rnd() * 3), top = clamp(d.realm - 1, 0, 2);
    for (let i = 0; i < n; i++) {
      const t = Math.floor(rnd() * (top + 1));
      const id = gearDropId(Math.floor(rnd() * 1e9), t);
      if (itemDef(id).tier > 3) continue;   // 套装件是三四品：低阶摊子上不放四品的
      g.living.give(d, id, 1);
      ((F.gear[d.id] ??= {})[id] ??= []).push(rollAffixes(itemDef(id).tier, rnd));
    }
  }
  /**
   * 11e 进货：摊主袋里的东西多是在家乡、大坊市攒下的，摆到这一带的摊上，有一半按坊市的规矩（data/market.ts 的 ruleOf：
   * 村镇摊子不卖高阶货、别处的独门货）摆不出来，一摊只剩两三格。出摊前他先到本价区的万宝楼挑这一带摊上卖得出去的货，
   * 按行情一成以内的价买几件（真金白银付给寄售的人，楼里照抽成；东西真进他的袋）——规矩不放宽，是他进的货对路了。
   * 只花身家的四成（行商六成），摊上够六格（行商八格）就不进；装备（带词条）不进。不取随机数，同一集期只进一回。
   */
  private restock(d: NpcData) {
    const F = this.F, per = this.period(), rs = (F.rs ??= {});
    if (rs[d.id] === per) return;
    rs[d.id] = per;
    const l = this.cur?.loc ?? LOC_BY_ID.get(d.home), W = this.game.wanbao; if (!l || !W) return;
    const merchant = d.faction === 'merchant', want = merchant ? 8 : 6, lvl = merchant ? 2 : 1;
    let have = this.sellable(d).length;
    if (have >= want) return;
    const z = wbZoneOf(l), mz = zoneOfLoc(l), floor = d.wealth * (1 - (merchant ? 0.6 : 0.4));
    const seen = new Set<string>();
    const cand = W.listingsIn(z).filter((x) => {
      const it = itemDef(x.item);
      if (x.seller === d.id || x.affix || it.type === 'gear' || it.type === 'misc' || seen.has(x.item) || (d.bag?.[x.item] ?? 0) > 0) return false;
      if (it.tier > Math.max(1, d.realm) + 1 || !sellableAt(it, mz, lvl) || x.price > W.ref(z, x.item, x.age) * 1.1) return false;
      seen.add(x.item); return true;
    }).sort((a, b) => a.price / W.ref(z, a.item, a.age) - b.price / W.ref(z, b.item, b.age) || a.id - b.id);
    for (const x of cand) {
      if (have >= want) break;
      const cap = W.ref(z, x.item, x.age) * 1.1;
      let got = 0;
      for (let k = 0; k < 3; k++) { if (d.wealth - x.price < floor || !W.npcBuy(d, x.item, cap, l)) break; got++; }
      if (got) have++;
    }
  }
  /** 摊主袋里某件装备的词条副表：和袋里的件数对齐（被劫、被卖掉的多了就截掉；少了按自己的种子补摇） */
  private gearList(d: NpcData, id: string): Affix[][] {
    const n = d.bag?.[id] ?? 0, byId = (this.F.gear[d.id] ??= {});
    const a = (byId[id] ??= []);
    while (a.length > n) a.pop();
    for (let i = a.length; i < n; i++) a.push(rollAffixes(itemDef(id).tier, mulberry32(mix(d.seed, strHash(id), i + 7))));
    return a;
  }
  /**
   * 第六轮返工：NPC 袋里的装备不经摊位离开袋子（被劫、被杀后储物袋归人、挂到万宝楼寄售、被你杀了掉在地上）时，
   * 把这几件的词条一并取出来带走（和袋里件数对齐后从末尾取 n 件——gearList 截短时也是从末尾截）。必须在 living.take 之前调。
   * 不是装备返回空表；不取随机数（对齐时补摇用的是摊主自己的种子）
   */
  gearOut(d: NpcData, id: string, n: number): Affix[][] {
    if (n <= 0 || ITEMS[id]?.type !== 'gear' || !(d.bag?.[id])) return [];
    const a = this.gearList(d, id);
    return a.splice(Math.max(0, a.length - n), n).map((x) => x.map((q) => ({ ...q })));
  }
  /** 第六轮返工：带着词条的装备进 NPC 的袋（劫来的、继承的、楼里买来的）——必须在 living.give 之前调：先对齐，再把词条接上 */
  gearIn(d: NpcData, id: string, list: Affix[][] | undefined) {
    if (!list?.length || ITEMS[id]?.type !== 'gear') return;
    const a = this.gearList(d, id);
    for (const x of list) a.push(x.map((q) => ({ ...q })));
  }
  /** 他身上的哪些东西肯拿出来卖：冲关要用的破境丹、正用着的那件最好的法器留着 */
  private sellable(d: NpcData): [string, number][] {
    const keep = new Map<string, number>();
    const kp = KEY_PILL[d.realm]; if (kp && d.stage >= REALMS[d.realm].stages.length - 1) keep.set(kp, 1);
    const best = this.game.living.bestArtifact(d); if (best) keep.set(best.id, 1);
    const out: [string, number][] = [], mz = zoneOfLoc(this.cur?.loc ?? LOC_BY_ID.get(d.home));
    for (const [id, n0] of Object.entries(d.bag ?? {})) {
      const it = ITEMS[id]; if (!it || !tradable(it) || it.type === 'misc') continue;
      // 摆出来的货照这一带坊市的规矩（data/market.ts）：行商按二级坊市、别人按村镇那一档——高阶妖丹、别处的独门货、有主之宝
      // 留在袋里不摆（原先袋里有什么摆什么，南荒小摊上摆出了七级妖丹，「高阶妖丹只在外海拍卖会」就破了）
      if (!sellableAt(it, mz, d.faction === 'merchant' ? 2 : 1)) continue;
      const n = n0 - (keep.get(id) ?? 0); if (n > 0) out.push([id, n]);
    }
    return out;
  }
  /** 主营什么：按货值分五类，占到四成五的那一类；都不够就是杂货 */
  wareOf(d: NpcData): Ware {
    const v: Record<Ware, number> = { dan: 0, fu: 0, qi: 0, yao: 0, za: 0 };
    let tot = 0;
    for (const [id, n] of this.sellable(d)) {
      const it = itemDef(id), w = Math.sqrt(Math.max(1, it.price)) * n;
      const k: Ware = it.type === 'pill' ? 'dan' : it.type === 'talisman' || it.type === 'scroll' ? 'fu' : it.type === 'artifact' || it.type === 'gear' ? 'qi' : it.type === 'herb' || it.type === 'material' ? 'yao' : 'za';
      v[k] += w; tot += w;
    }
    let best: Ware = 'za', bv = 0;
    for (const k of ['dan', 'fu', 'qi', 'yao'] as Ware[]) if (v[k] > bv) { bv = v[k]; best = k; }
    return tot > 0 && bv / tot >= 0.45 ? best : 'za';
  }
  /** 急着用钱：身家见底，或者正为求人助拳、养伤奔走 */
  urgent(d: NpcData) { return d.wealth < 30 * Math.pow(3, Math.max(0, d.realm - 1)) || d.plan?.k === 'seek' || d.plan?.k === 'heal'; }
  stallName(d: NpcData, ware = this.wareOf(d)): string {
    const sur = d.name.length >= 3 && ['欧阳', '慕容', '上官', '司马'].includes(d.name.slice(0, 2)) ? d.name.slice(0, 2) : d.name.slice(0, 1);
    return pick(NAME_PAT[ware], mix(d.seed, 0x7a3e) / 4294967296).replace('{姓}', sur).replace('{名}', d.name.slice(-1));
  }
  /** 这一句吆喝（每八九息换一句；按货、性情、急不急、手里最值钱的那件挑） */
  shout(d: NpcData, ware = this.wareOf(d), t = this.game.time): string {
    const bucket = Math.floor((t + (d.seed % 7)) / 8.5);
    const r = mulberry32(mix(d.seed, bucket, 0x5407));
    const pool: string[] = [...SHOUT_WARE[ware], ...(SHOUT_PERS[d.pers] ?? [])];
    if (this.urgent(d)) pool.push(...SHOUT_URGENT, ...SHOUT_URGENT);
    const top = this.sellable(d).sort((a, b) => itemDef(b[0]).price - itemDef(a[0]).price)[0];
    if (top) { const nm = itemDef(top[0]).name; pool.push(`新到的${nm}，就这几件！`, `${nm}，识货的来看！`); }
    return pick(pool, r());
  }
  info(d: NpcData): StallInfo {
    const ware = this.wareOf(d);
    return { d, name: this.stallName(d, ware), ware, shout: this.shout(d, ware), urgent: this.urgent(d), seat: this.seatOf(d), loc: this.cur?.loc ?? LOC_BY_ID.get(d.home) };
  }
  private zone(d: NpcData) { return wbZoneOf(this.cur?.loc ?? LOC_BY_ID.get(d.home)); }
  /** 灵草没记年份：按人、按草定一个（同一个人的同一种草年份不变） */
  private ageOf(d: NpcData, id: string) { return itemDef(id).type === 'herb' ? 20 + (mix(d.seed, strHash(id), 0xa9e) % 140) : undefined; }
  /** 开价 = 行情 × 性情 × 急不急 × 交情；还价成了再让一截 */
  priceOf(d: NpcData, ref: number, key: string): number {
    const urgent = this.urgent(d) ? 0.8 : 1, favor = 1 - clamp(d.favor, 0, 60) / 300;
    let p = ref * (SELL_MUL[d.pers] ?? 1) * urgent * favor;
    if (this.F.hag[d.id + '|' + key] === 'ok') p *= this.hagCut(d, key);
    const mp = this.modView?.npc === d.id ? this.modView.price.get(key) : undefined;
    return Math.max(1, Math.round(mp ?? p));
  }
  private hagCut(d: NpcData, key: string) { return 0.78 + (mix(d.seed, strHash(key), 0xc07) % 9) / 100; }
  /** 摊上的货（一次算全：真货来自他的袋子，掺的假货当天定好） */
  goods(d: NpcData): StallGood[] {
    const F = this.F, z = this.zone(d), W = this.game.wanbao;
    this.stock(d);
    const out: StallGood[] = [];
    for (const [id, n] of this.sellable(d)) {
      const it = itemDef(id);
      if (it.type === 'gear') {
        const list = this.gearList(d, id);
        for (let i = 0; i < Math.min(n, list.length); i++) {
          const key = id + '#' + i, ref = W.ref(z, id);
          out.push({ key, id, n: 1, ref, price: this.priceOf(d, ref, key), affix: list[i], gi: i, hag: F.hag[d.id + '|' + key], probed: !!F.probed[d.id + '|' + key] });
        }
        continue;
      }
      const age = this.ageOf(d, id), key = id, ref = W.ref(z, id, age);
      out.push({ key, id, n, ref, age, price: this.priceOf(d, ref, key), hag: F.hag[d.id + '|' + key], probed: !!F.probed[d.id + '|' + key] });
    }
    // 掺假：当天编一次（renxin.injectStallFakes，散修、行商约两成会掺）
    if (!F.fk[d.id]) { const arr: ShopStock[] = []; this.game.renxin?.injectStallFakes(d, arr); F.fk[d.id] = arr; }
    F.fk[d.id].forEach((s, i) => { if (s.n > 0) out.unshift({ key: 'fake#' + i, id: s.id, n: s.n, ref: s.origPrice ?? itemDef(s.id).price, price: s.price, fake: s.fake, ident: s.ident, origPrice: s.origPrice, hag: F.hag[d.id + '|fake#' + i] }); });
    out.sort((a, b) => (+!!b.fake - +!!a.fake) || ((TYPE_ORDER[itemDef(a.id).type] ?? 8) - (TYPE_ORDER[itemDef(b.id).type] ?? 8)) || itemDef(b.id).tier - itemDef(a.id).tier || b.price - a.price);
    const mv = this.modView?.npc === d.id ? this.modView : null;
    return (mv ? out.filter((g) => !mv.hide.has(g.key)) : out).slice(0, STALL_CELLS);
  }

  // ------------------------------------------------------------ 买卖
  private stones() { return C.bagCount(this.game.hero, 'mat_lingshi'); }
  /** 买下一件：返回 null 成交，否则是不成的缘故 */
  buy(d: NpcData, gd: StallGood): string | null {
    const g = this.game, h = g.hero, F = this.F;
    if (!d.alive) return '摊主已不在了。';
    if (gd.fake && gd.ident) return '你已看破这是假货，莫花冤枉钱。';
    if (gd.hag === 'fail' || F.hag[d.id + '|' + gd.key] === 'fail') return `${d.name}板着脸：这件不卖你了。`;
    const price = gd.price;
    if (this.stones() < price) return '灵石不够。';
    if (gd.fake) {
      const s = F.fk[d.id]?.[Number(gd.key.split('#')[1])]; if (!s || s.n <= 0) return '这件已经卖掉了。';
      C.removeItem(h, 'mat_lingshi', price);
      C.addFakeItem(h, s.id, 1, s.fake!, d.id, d.name, s.age);
      s.n--; d.wealth += price;
    } else {
      if ((d.bag?.[gd.id] ?? 0) <= 0) return '这件已经卖掉了。';
      C.removeItem(h, 'mat_lingshi', price);
      if (itemDef(gd.id).type === 'gear') {
        const list = this.gearList(d, gd.id), affix = list.splice(gd.gi ?? 0, 1)[0];
        g.living.sold(d, gd.id, price);
        C.addGearItem(h, gd.id, affix);
      } else {
        g.living.sold(d, gd.id, price);
        C.addItem(h, gd.id, 1, gd.age);
      }
    }
    flow('stall', price);   // 总账：你付给摊主的灵石进了世界——一笔转手，不是新的进水口
    if (d.favor < 30) d.favor = Math.min(30, d.favor + 1);
    return null;
  }
  /** 还价成功的几率：好感、口才（魅力）、性情、境界差 */
  hagChance(d: NpcData): number {
    const h = this.game.hero;
    const gap = (h.realm * 13 + h.stage) - (d.realm * 13 + d.stage);
    return clamp(0.32 + d.favor / 150 + C.mod(h, 'charm') / 150 + (HAG_PERS[d.pers] ?? 0) + clamp(gap * 0.012, -0.1, 0.18) + (this.urgent(d) ? 0.08 : 0), 0.08, 0.88);
  }
  /** 还价一次：成了让一截（返回让后的价），砸了这件不卖你、他不高兴（每件每天只许还一次；结果按种子定，读档也翻不了） */
  haggle(d: NpcData, gd: StallGood): { ok: boolean; price: number; line: string } | null {
    const F = this.F, k = d.id + '|' + gd.key;
    if (F.hag[k]) return null;
    const r = mulberry32(mix(d.seed, strHash(gd.key), F.day * 7 + 0x4a6))();
    const ok = r < this.hagChance(d);
    F.hag[k] = ok ? 'ok' : 'fail';
    if (!ok) d.favor = Math.max(-100, d.favor - 2);
    const L = ok
      ? pick(['罢了罢了，就当交个朋友。', '你这人会说话，便宜你了。', '唉，今天手头紧，依你。', '看在道友面上，让一些。'], r * 7.3 % 1)
      : pick(['去去去，这价钱我还不如自己留着！', '你当我这是破烂摊子？这件不卖你了！', '还价还到这份上？不卖了。', '哼，识货的不还价。'], r * 5.1 % 1);
    return { ok, price: ok ? this.priceOf(d, gd.ref, gd.key) : gd.price, line: L };
  }
  /** 掌眼：假货按 renxin 的几率看破；真货耗点法力看个放心 */
  probe(d: NpcData, gd: StallGood): { spottedFake: boolean; msg: string } {
    const g = this.game, F = this.F;
    if (gd.fake) { const s = F.fk[d.id]?.[Number(gd.key.split('#')[1])]; if (s) return g.renxin.probeShopItem(s); }
    const res = g.renxin.probeShopItem({ id: gd.id, price: gd.price, n: gd.n });
    if (!/法力不足/.test(res.msg)) F.probed[d.id + '|' + gd.key] = 1;
    return res;
  }
  /** 卖给他的出价（行情 × 他的压价）；他身上的灵石不够就是 0 */
  offer(d: NpcData, b: C.BagItem): number {
    const it = itemDef(b.id);
    if (!tradable(it) || it.type === 'misc' || b.worn || (b.fake && b.ident)) return 0;
    const ref = this.game.wanbao.ref(this.zone(d), b.id, b.age);
    return Math.max(1, Math.round(ref * (BUY_MUL[d.pers] ?? 0.55) * (this.urgent(d) ? 0.9 : 1)));
  }
  /** 卖一件给他：上限是他的身家；装备的词条记进他的副表 */
  sellTo(d: NpcData, b: C.BagItem): string | null {
    const g = this.game, h = g.hero;
    if (!h.bag.includes(b)) return '袋里没有这件了。';
    const it = itemDef(b.id), p = this.offer(d, b);
    if (!p) return b.worn ? '穿在身上的不能卖，先卸下来。' : '这东西他不收。';
    if (Object.values(h.equip ?? {}).includes(b.id) && C.bagCount(h, b.id) <= 1) return '正用着的法器不能卖，先收起来。';
    if (p > d.wealth) return `${d.name}摸了摸储物袋：「身上只剩 ${Math.floor(Math.max(0, d.wealth))} 灵石，收不起。」`;
    if (it.type === 'gear') {
      const i = h.bag.indexOf(b); h.bag.splice(i, 1);
      this.gearList(d, b.id);   // 先对齐，再把这一件的词条接上
      g.living.give(d, b.id, 1);
      ((this.F.gear[d.id] ??= {})[b.id] ??= []).push((b.affix ?? []).map((a) => ({ ...a })));
    } else {
      if (b.fake) { const i = h.bag.indexOf(b); b.n--; if (b.n <= 0) h.bag.splice(i, 1); }
      else C.removeItem(h, b.id, 1, b.age ?? 0);
      g.living.give(d, b.id, 1);
    }
    if (h.hotbar.some((x) => x && x.endsWith(':' + b.id)) && !h.bag.some((x) => x.id === b.id)) h.hotbar = h.hotbar.map((x) => (x && x.endsWith(':' + b.id) && !x.startsWith('pill:') ? null : x));
    d.wealth -= p;
    C.addItem(h, 'mat_lingshi', p);
    flow('stall', -p);   // 总账：摊主付给你的灵石离开了世界（转手的另一头）
    return null;
  }

  // ------------------------------------------------------------ 打开
  /** 开这个人的摊位窗口（交谈里的「交易」、点招牌都走这里）。照常触发模组的 shop 钩子（和 game.openShop 一样 fire） */
  open(d: NpcData): boolean {
    const g = this.game;
    this.modView = null;
    if (modx?.has('shop')) {
      const gs = this.goods(d), inf = this.info(d);
      const c = modx.fire('shop', { title: `${d.name} · ${inf.name}`, loc: inf.loc?.id ?? null, stock: gs.map((s) => ({ id: s.id, price: s.price, n: s.n, age: s.age, seller: d.id, sellerName: d.name })) });
      if (c.cancel) return false;
      const ret = (Array.isArray(c.stock) ? c.stock : []) as { id?: string; price?: number }[];
      const price = new Map<string, number>(), hide = new Set<string>();
      gs.forEach((s, i) => { const r = ret[i]; if (!r || r.id !== s.id) { hide.add(s.key); return; } const p = Math.max(0, Math.round(+(r.price ?? s.price) || 0)); if (p !== s.price) price.set(s.key, p); });
      this.modView = { npc: d.id, price, hide };
    }
    if (g.modal?.kind === 'dialog') g.modal = null;
    g.openModal({ kind: 'stall', npc: d.id });
    return true;
  }
  /** game.ts 里 pendingTalk 到了跟前：是点招牌走过来的就开摊位（返回 true），否则照常交谈 */
  arrive(a: Active): boolean {
    if (this.pendingOpen !== a.d.id) return false;
    this.pendingOpen = null;
    return this.open(a.d);
  }

  // ------------------------------------------------------------ 招牌
  /** 点击（屏幕坐标）：点中招牌就处理（近了开窗口，远了走过去），返回 true */
  click(cx: number, cy: number): boolean {
    const g = this.game, r = g.canvas?.getBoundingClientRect?.();
    const x = cx - (r?.left ?? 0), y = cy - (r?.top ?? 0);
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const q = this.hits[i];
      if (x < q.x0 - 6 || x > q.x1 + 6 || y < q.y0 - 6 || y > q.y1 + 6) continue;   // 手指粗：四边各放宽 6 像素
      const a = g.npcs.active.get(q.id); if (!a || !a.d.alive || a.enemy) continue;
      g.pendingGather = null;
      if (Math.hypot(a.st.x - g.player.x, a.st.y - g.player.y) < 190) { g.pendingTalk = null; g.destination = null; this.pendingOpen = null; this.open(a.d); }
      else { g.pendingTalk = a.d.id; this.pendingOpen = a.d.id; g.setDestination(a.st.x, a.st.y + 34); }
      return true;
    }
    return false;
  }
  private hoverId(rect: DOMRect | undefined): string | null {
    if (!this.mouse.on) return null;
    const x = this.mouse.x - (rect?.left ?? 0), y = this.mouse.y - (rect?.top ?? 0);
    for (let i = this.hits.length - 1; i >= 0; i--) { const q = this.hits[i]; if (x >= q.x0 && x <= q.x1 && y >= q.y0 && y <= q.y1) return q.id; }
    return null;
  }
  /**
   * 界面层画招牌（render.ts 在建筑名牌之后调一次）：屏幕坐标、大小恒定。两行——摊名（鎏金）和一句吆喝，带小尾巴，轻轻浮动；
   * 互相避让、避开主角；远了淡出；鼠标悬停高亮。
   * 第五轮：以前招牌只要压到任何一块界面（core/hudzones）就整块不画——手机竖屏上任务列、地点卡、按钮几乎铺满画面，一个都画不出来，
   * 点不到、摆摊小课也不触发。现在只躲「真接点击的界面」（hard）；被压住时先挪位（往上、左右、往下、再远一圈），
   * 再换只写摊名的一行小招牌，挪开了就从招牌尾巴拉一道细线指回摊主头顶。只压着纯显示的界面（soft：消息、地名横幅）照样能点，尽量躲、躲不开也画。
   */
  drawSigns(g: CanvasRenderingContext2D, hd: HdScene, W: number, H: number, ud: number) {
    this.hits = [];
    const game = this.game, cur = this.cur;
    if (!cur || !cur.seats.size || game.offWorld) return;
    const z = game.cam.zoom; if (z < 0.4) return;
    const p = game.player, t = game.time, now = performance.now();
    const list: { a: Active; inf: StallInfo; sx: number; sy: number; dist: number }[] = [];
    for (const id of cur.seats.keys()) {
      const a = game.npcs.active.get(id);
      if (!a || a.enemy || !a.d.alive || a.life?.n !== STALL_MARK) { this.born.delete(id); continue; }
      const dist = Math.hypot(a.st.x - p.x, a.st.y - p.y);
      if (dist > 2300 || game.life.vis({ x: a.st.x, y: a.st.y }) < 0.3) { this.born.delete(id); continue; }
      const s = hd.project(a.st.x, a.st.y, 168); s.y -= 14;   // 名牌、心声气泡之上
      // 招牌在画面上沿外、人还在画面里（手机横屏镜头近）：把招牌压到画面上沿以内
      if (s.x < -160 || s.x > W + 160 || s.y > H + 40) continue;
      if (s.y < 8) { const f = hd.project(a.st.x, a.st.y, 0); if (f.y < 0) continue; s.y = 8; }
      list.push({ a, inf: this.info(a.d), sx: s.x, sy: s.y, dist });
    }
    if (!list.length) return;
    list.sort((x, y) => x.dist - y.dist);
    const rect = game.canvas?.getBoundingClientRect?.();
    const hov = this.hoverId(rect);
    // 不挡主角
    const avoid: SignRect[] = [];
    { hd.groundAt(p.x, p.y); const k = Math.max(0.4, hd.ss); avoid.push([hd.sx - 40 * k, hd.sy - 140 * k, hd.sx + 40 * k, hd.sy + 6 * k]); }
    const hard: SignRect[] = [], soft: SignRect[] = [];
    for (const q of hudRects) (q.soft ? soft : hard).push([q.x0, q.y0, q.x1, q.y1]);
    const used: SignRect[] = [];
    g.save(); g.setTransform(ud, 0, 0, ud, 0, 0);
    const fz = Math.round(clamp(13 + (z - 0.6) * 4, 12, 16));
    for (const it of list) {
      const id = it.a.d.id, on = hov === id || this.pendingOpen === id;
      const bob = Math.sin(t * 1.7 + (it.a.d.seed % 100)) * 2.4;
      // 先整块招牌，放不下换只写摊名的小招牌
      let spr: HTMLCanvasElement | null = null, pl: SignPlace | null = null;
      for (const lite of [false, true]) {
        const c = this.sign(it.inf, lite ? Math.max(11, fz - 1) : fz, ud, on, lite);
        const q = placeSign(it.sx, it.sy + bob, c.width / ud, c.height / ud, W, H, hard, soft, [...avoid, ...used]);
        if (q && (!lite || !pl || q.cost < pl.cost)) { spr = c; pl = q; }
        if (q && q.cost < 1) break;   // 原位（或只挪了一点）就放得下：不用再试小招牌
      }
      if (!spr || !pl) continue;
      const w = pl.r[2] - pl.r[0], h = pl.r[3] - pl.r[1], x0 = pl.r[0], y0 = pl.r[1];
      if (!this.born.has(id)) this.born.set(id, now);
      const age = (now - this.born.get(id)!) / 1000, pop = Math.min(1, age / 0.28);
      used.push([x0 - 3, y0 - 2, x0 + w + 3, y0 + h + 2]);
      // 远了淡出（1500–2300），出现时从小到大弹一下
      const fade = clamp((2300 - it.dist) / 800, 0, 1) * clamp((z - 0.4) / 0.12, 0, 1);
      const sc = (0.82 + 0.18 * (1 - Math.pow(1 - pop, 3))) * (on ? 1.06 : 1);
      g.globalAlpha = fade * (0.35 + 0.65 * pop);
      const cx = x0 + w / 2, by = y0 + h;
      // 挪开了：从招牌尾巴拉一道细金线指回摊主头顶
      if (pl.moved) {
        g.strokeStyle = 'rgba(232,200,120,0.75)'; g.lineWidth = 1.2; g.setLineDash([4, 3]);
        g.beginPath(); g.moveTo(cx, by - 2); g.lineTo(it.sx, it.sy + 10); g.stroke(); g.setLineDash([]);
        g.fillStyle = 'rgba(232,200,120,0.9)'; g.beginPath(); g.arc(it.sx, it.sy + 10, 2.4, 0, Math.PI * 2); g.fill();
      }
      g.setTransform(ud * sc, 0, 0, ud * sc, cx * ud * (1 - sc), by * ud * (1 - sc));
      g.drawImage(spr, x0, y0, w, h);
      g.setTransform(ud, 0, 0, ud, 0, 0);
      this.hits.push({ id, x0, y0, x1: x0 + w, y1: y0 + h });
    }
    g.restore(); g.globalAlpha = 1;
  }
  /** 招牌图（缓存）：乌木漆底、鎏金细框、左边一枚朱印写主营、摊名鎏金、吆喝米色小字、底下一个小尾巴 */
  private sign(inf: StallInfo, fs: number, ud: number, hot: boolean, lite = false): HTMLCanvasElement {
    const key = `${inf.name}|${inf.shout}|${inf.ware}|${fs}|${ud}|${hot ? 1 : 0}|${inf.urgent ? 1 : 0}|${lite ? 1 : 0}`;
    const hitC = this.spr.get(key); if (hitC) return hitC;
    const c = document.createElement('canvas'), m = c.getContext('2d')!;
    const fN = `${fs + 3}px "Ma Shan Zheng", "STKaiti", "KaiTi", serif`, fS = `${fs}px "Noto Serif SC", "Songti SC", serif`;
    m.font = fN; const nw = m.measureText(inf.name).width;
    m.font = fS; const swd = m.measureText(inf.shout).width;
    const seal = (fs + 3) * 1.25, pad = fs * 0.62, gap = fs * 0.4;
    // lite：只写摊名一行（被界面挤得放不下整块招牌时用）
    const bw = Math.max(seal + gap + nw, lite ? 0 : swd) + pad * 2, l1 = (fs + 3) * 1.45, l2 = lite ? 0 : fs * 1.5, bh = l1 + l2 + pad * 0.5, tail = fs * 0.7;
    const W = bw + 8, H = bh + tail + 6;
    c.width = Math.ceil(W * ud); c.height = Math.ceil(H * ud);
    const x = c.getContext('2d')!; x.scale(ud, ud); x.translate(4, 3);
    const r = 5;
    const shape = () => {
      x.beginPath(); x.moveTo(r, 0); x.lineTo(bw - r, 0); x.quadraticCurveTo(bw, 0, bw, r); x.lineTo(bw, bh - r); x.quadraticCurveTo(bw, bh, bw - r, bh);
      x.lineTo(bw / 2 + tail * 0.8, bh); x.lineTo(bw / 2, bh + tail); x.lineTo(bw / 2 - tail * 0.8, bh);
      x.lineTo(r, bh); x.quadraticCurveTo(0, bh, 0, bh - r); x.lineTo(0, r); x.quadraticCurveTo(0, 0, r, 0); x.closePath();
    };
    // 底：乌木漆
    const bg = x.createLinearGradient(0, 0, 0, bh);
    bg.addColorStop(0, hot ? 'rgba(66,42,24,0.97)' : 'rgba(46,30,18,0.94)'); bg.addColorStop(1, hot ? 'rgba(36,22,12,0.97)' : 'rgba(24,15,9,0.94)');
    x.fillStyle = bg; shape(); x.fill();
    x.lineWidth = hot ? 1.8 : 1.2; x.strokeStyle = hot ? 'rgba(255,224,150,0.95)' : 'rgba(216,180,101,0.8)'; shape(); x.stroke();
    // 内框一道细金线
    x.strokeStyle = 'rgba(216,180,101,0.28)'; x.lineWidth = 0.8; x.strokeRect(3, 3, bw - 6, bh - 6);
    // 朱印
    const sy = pad * 0.55 + (l1 - seal) / 2;
    x.fillStyle = inf.urgent ? '#c2402c' : '#a8352a'; x.fillRect(pad, sy, seal, seal);
    x.strokeStyle = 'rgba(255,236,200,0.6)'; x.lineWidth = 0.8; x.strokeRect(pad + 1.5, sy + 1.5, seal - 3, seal - 3);
    x.fillStyle = '#fbe9cc'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = `${seal * 0.74}px "Ma Shan Zheng", "STKaiti", serif`; x.fillText(WARE_GLYPH[inf.ware], pad + seal / 2, sy + seal / 2 + seal * 0.04);
    // 摊名：鎏金
    const g1 = x.createLinearGradient(0, sy, 0, sy + seal);
    g1.addColorStop(0, '#fff1c4'); g1.addColorStop(0.5, '#e7c06a'); g1.addColorStop(1, '#b8842e');
    x.fillStyle = g1; x.font = fN; x.textAlign = 'left';
    x.fillText(inf.name, pad + seal + gap, sy + seal / 2 + 1);
    // 吆喝
    if (!lite) {
      x.fillStyle = hot ? '#fff4dc' : '#ead8b4'; x.font = fS; x.textAlign = 'center';
      x.fillText(inf.shout, bw / 2, pad * 0.55 + l1 + l2 / 2);
    }
    if (this.spr.size > 160) this.spr.clear();
    this.spr.set(key, c);
    return c;
  }
}

/** 摊主的称呼一行：境界 · 身份 · 性情 */
export function keeperTitle(d: NpcData, pers: string): string {
  return `${d.realm ? realmName(d.realm, d.stage) : '凡人'} · ${d.faction === 'merchant' ? '行商' : d.faction === 'sect' ? '宗门弟子' : '散修'} · ${pers}`;
}
