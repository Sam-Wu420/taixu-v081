// 人界世界状态（声望、宗门、知交、大事件、传闻），随存档保存

export interface SectTask { id: string; kind: 'kill' | 'gather' | 'deliver' | 'patrol' | 'catch'; text: string; target: string; need: number; have: number; reward: number; exp: number; until: number }
export interface SectState { id: string; rank: number; contrib: number; joined: number; lastPay: number; tasks: SectTask[]; done: number }
export interface HeartState { favor: number; stage: number; met: boolean; follow: boolean; flags: Record<string, any>; lastGift: number; lastTalk: number; gifts: number }
export interface EventState { state: 'pending' | 'active' | 'done' | 'missed'; result?: string; t?: number; score?: number }

export interface WorldState {
  rep: number;                         // 正道声望（为负即魔名）
  sect: SectState | null;
  hearts: Record<string, HeartState>;
  flags: Record<string, any>;
  events: Record<string, EventState>;
  /** 第三十五步：按境界提前开启的大事（提前的天数）与下一件的最早开启日 */
  evShift?: Record<string, number>; evNext?: number;
  news: { day: number; text: string; kind?: 'canon' | 'rumor' | 'personal' }[];
  tp: string[];                        // 已激活的传送阵
  kills: Record<string, number>;       // 按敌人种类计数（宗门任务）
  hints: string[];                     // 已显示过的新手提示
  /** v0.53：你主持的阵法（各图都存） */
  zf?: import('./zhenfa').ZhenSave[];
  // ---------- 第十八步：机缘、洞府、灵宠、传音、悬赏 ----------
  sites: Record<string, SiteState>;    // 地图机缘的状态（键：图|格）
  home: HomeState | null;              // 洞府（每局一座，可迁居）
  pets: PetState[]; petActive: number; // 灵宠
  incubate: { id: string; days: number; need: number } | null;   // 正在温养的灵卵
  letters: Letter[];                   // 传音符
  bounties: Bounty[];                  // 已接的悬赏
  caches: CacheState[];                // 残图所指的藏宝处
  blessUntil: number;                  // 山神庇佑（至某日）
  // ---------- 人心篇：江湖阅历（《苏寒随笔》）与被夺储物袋追踪 ----------
  exp2?: Exp2Entry[];
  stolenBags?: StolenBag[];
  // ---------- 江湖篇：信义（cred）、消息对象（Rumor）、假货账、勒索/威名、假悬赏 ----------
  cred?: number;                       // 江湖信义 0–100（独立于正邪 rep）：骗局得手降，守信升
  rumors?: Rumor[];                    // 一切非亲眼所见的消息都走它
  fakeSales?: FakeSale[];              // 玩家卖出的假货（买家会发现、记仇）
  jh?: JianghuFlags;
  // ---------- 天道篇：道心难度分层、资源限供台账、骗局续（结拜图谋 / 洞府以次充好 / 商队夹带）----------
  dao?: DaoState;
  pj?: PianjuFlags;
  /** 野外破坏：留得久的大坑、长沟（world/wreck.ts；可选，旧存档没有） */
  wreck?: import('./wreck').WreckSave;
  /** 城镇破坏：每座城的损坏条目、地面痕迹、城墙焦痕、损坏账（world/townwreck.ts；可选，旧存档没有） */
  townwreck?: import('./townwreck').TWSave;
  /** 恩怨重做：累计游玩秒数（随光阴走，暂停、读档、关窗口都不走；劫道冷却、追杀间隔等按它和天数两个都到了才解除；可选，旧存档从 0 算） */
  play?: number;
  /** 恩怨重做 · 第二批：劫案、通缉、生死斗、传音已读、口碑传播队列（world/enyuan.ts；可选） */
  ey?: import('./enyuan').EySave;
  /** 恩怨重做 · 第三批（全部可选）：NPC 执法的案底与追捕（zhifa.ts）、NPC 主动找你（laifang.ts）、搭档（dazi.ts）、夺宝局（duobao.ts） */
  zfa?: import('./zhifa').ZfSave; lf?: import('./laifang').LfSave; dz?: import('./dazi').DzSave; db?: import('./duobao').DbSave;
  // ---------- v0.60 开宗立派：自家宗门、自创功法 ----------
  mySect?: import('./mysect').MySect;
  /** v0.70 问道残卷 · 观招篇：各式领悟进度与已全篇者 */
  canjuan?: import('./canjuan').CjState;
  myArts?: import('./mysect').MyArt[];
  // ---------- 防刷库存账本：各处坊市/丹铺/法器阁/符箓斋/藏经阁/鬼市/散修私货/拍卖会按周期持久保存 ----------
  shopCache?: Record<string, import('./modal').ShopStock[]>;
  auctions?: Record<string, import('./town').AuctionLot[]>;
}

/** 天道篇：道心（难度）分层——只可上调，不可下调 */
export type DaoTier = 'tianjiao' | 'taixu' | 'tiandao';
export interface DaoState {
  tier: DaoTier;
  chosen: number;                      // 立下道心那一日
  raised?: number;                     // 中途砥砺道心的次数
  deaths?: number;                     // 本世陨落次数（天道档只有一座碑属于你）
  quota?: { m: number; led: Record<string, number> };   // 资源限供：按产区逐月台账（键 pz|itemId → 本月已发数量）
  contest?: number;                    // 上次「另一道神识也锁定了这里」的日子
  contests?: number; seenContest?: number;
  legacy?: number;                     // 已继承的前世碑 id
  /** v0.51.3 灵草守恒：争夺未结算时，采下的灵药先记在账上——走远了归他、读档回来归你、陨落则随遗物入碑 */
  pending?: { items: { item: string; n: number; age?: number }[]; npcId: string; name: string };
}
/** 天道篇：前世之碑——陨落之处立一座刻着生平的碑，下一世的世界里真能遇到 */
export interface Stele {
  id: number; ver: string;
  name: string; root: string; gongfa: string; realm: string; age: number;
  day: number; year: number;
  map: string; x: number; y: number; place: string;
  sect: string | null; rank?: string; rep: number; cred: number; kills: number; tier: DaoTier;
  killer: string; killerId?: string; cause: string;
  bio: string[];                       // 生平（几行碑文）
  notes: string[];                     // 《苏寒随笔》摘录
  legacy: { stones: number; items: { id: string; n: number; age?: number }[] };
  when: number;                        // 现实时间戳
  read?: boolean; taken?: boolean;
  offered?: boolean;                   // v0.52 碑前香火：已替他上过三炷香（一碑只祭一次，香火换一缕前世残念）
  avenged?: boolean;                   // v0.52 前世之仇已报：夺袋仇家伏诛，遗物归位
}
/** 天道篇：骗局续的账 */
export interface PianjuFlags {
  sworn?: { id: string; name: string; day: number; stage: number; done?: boolean; seen?: boolean }[];   // #8 结拜图谋
  cave?: { broker: string; brokerId?: string; loc: string; day: number; q: number; adv: number; found?: boolean; dealt?: boolean };  // #10 洞府以次充好
  smuggle?: { day: number; town: string; done?: boolean }[];   // #11 商队夹带
  baby?: number;                       // 上次血婴哭声之日
  babySeen?: number;                   // 吃过几次亏
}
/** 江湖篇：消息对象——玩家看到的说法 / 真假 / 谁放出来的 / 动机 */
export interface Rumor {
  id: number; day: number;
  text: string;
  truth: number;                       // 0 假 / 0.5 半真 / 1 真
  src: string;                         // 谁说的（npc id，或 'book' 说书人 / 'me' 玩家）
  srcName: string;
  motive: 'honest' | 'bait' | 'smear' | 'proxy';
  kind: 'treasure' | 'letter' | 'person' | 'news';
  map?: string; x?: number; y?: number; tier?: number;
  targetId?: string; targetName?: string;   // smear：被诋毁者 / letter：收信人 / bait(byPlayer)：被调虎离山者
  verified?: number;                   // 1 印证为真 / -1 印证有假
  exposed?: boolean;                   // 玩家已知其真相（动机与来源）
  done?: boolean; byPlayer?: boolean; until: number;
  /** 恩怨重做 · 江湖传音（kind:'news'）：点了能接的支线、旁人的议论、原来是「神识中 / 江湖传闻」小消息 */
  hook?: { k: 'jade' | 'bounty' | 'team' | 'wanted' | 'report' | 'visit' | 'duobao' | 'dazi'; ref?: string | number }; talk?: string[]; amb?: boolean;
}
export interface FakeSale { id: number; buyerId: string; buyerName: string; item: string; day: number; price: number; found?: boolean }
export interface JianghuFlags {
  extort?: { name: string; realm: number; stage: number; day: number; n: number; paid: number };  // 先礼后兵：交过钱的记录（他会再来）
  feared?: number;                     // 翻脸打赢勒索者：这一片劫修绕着你走（至某日）
  poster?: { id: string; name: string; reward: number; victim: string; day: number };          // 待算账的假悬赏贴榜人
  shillSeen?: number;                  // 看穿过的拍卖托次数
}
export interface Exp2Entry {
  id: string;                          // 骗局/凶险类别：ruin_betray | fake_item | borrow_knife | duoshe | mask_read | bag_robbed | demon_captive
  day: number;
  kind: 'loss' | 'see';                // 吃亏长记性 / 慧眼识破
  title: string;
  text: string;
  count: number;
}
export interface StolenBag {
  id: number;
  culpritId: string;                   // 夺袋仇家/劫修在 npcs.byId 中的 id
  culpritName: string;
  day: number;
  map: string;
  stones: number;                      // 被搜走的灵石数
  items: { id: string; n: number; age?: number }[]; // 被搜走的原物清单
  spentStones?: number;                // 已被其花掉的灵石
  soldItems?: string[];                // 已被其在坊市卖掉/吃掉的物品名
  recovered?: boolean;
}
export interface SiteState { done?: number; layer?: number; seen?: 1; partner?: number; read?: 1; drink?: number; dive?: number; [k: string]: any }
export interface Plot { herb: string | null; age: number; n: number; day: number }
export interface HomeState { map: string; x: number; y: number; key: string; name: string; plots: Plot[]; array: number; built: number; robbed?: number; /** v0.53：洞府禁制（阵法 id） */ zf?: string[] }
export interface PetState { kind: string; name: string; lv: number; xp: number; bond: number; born: number }
export interface Letter { id: number; from: string; day: number; text: string; kind: 'chat' | 'req' | 'sos' | 'fest' | 'jealous' | 'gift'; read?: boolean; replied?: boolean; replies?: { label: string; favor: number; reply: string }[] }
export interface Bounty { id: string; town: string; map: string; name: string; def: string; realm: number; stage: number; x: number; y: number; reward: number; until: number; done?: boolean; spawned?: boolean;
  /** 江湖篇：假悬赏——榜上“妖修”其实是得罪了贴榜人的正派散修（活世界名册中人） */
  fake?: boolean; npcId?: string; posterId?: string; poster?: string; talked?: boolean; exposed?: boolean }
export interface CacheState { id: number; map: string; x: number; y: number; ox: number; oy: number; tier: number; done?: boolean }

export function newWorldState(): WorldState {
  return { rep: 0, sect: null, hearts: {}, flags: {}, events: {}, news: [], tp: [], kills: {}, hints: [], sites: {}, home: null, pets: [], petActive: 0, incubate: null, letters: [], bounties: [], caches: [], blessUntil: 0, exp2: [], stolenBags: [], cred: 60, rumors: [], fakeSales: [], jh: {}, dao: { tier: 'taixu', chosen: 0, quota: { m: -1, led: {} } }, pj: {}, shopCache: {}, auctions: {} };
}

/** 读取或生成某家铺子在当前进货周期的货架；自动淘汰同一铺子过期的旧账，防止开关界面刷新商品 */
export function cachedShopStock(
  ws: WorldState,
  prefix: string,
  period: number,
  build: () => import('./modal').ShopStock[],
): { key: string; stock: import('./modal').ShopStock[] } {
  const map = (ws.shopCache ??= {});
  const key = `${prefix}@${period}`;
  const head = `${prefix}@`;
  for (const k of Object.keys(map)) {
    if (k.startsWith(head) && k !== key) delete map[k];
  }
  if (!Array.isArray(map[key])) {
    map[key] = build();
  }
  return { key, stock: map[key] };
}

/** 道心三档：保自由度的标准答案——新玩家/剧情党选天骄，默认推荐凡人，天道档死了就是死了 */
export const DAO_TIERS: { id: DaoTier; name: string; seal: string; short: string; desc: string; warn?: string }[] = [
  {
    id: 'tianjiao', name: '天骄', seal: '骄', short: '天资卓绝，一路顺遂',
    desc: '现状规则：战败只损些修为杂物、被路人救回；骗局稀少（约六成）；坊市货源充足；死敌补刀亦可自存档回溯。适合初来人界、只想读完这段故事的人。',
  },
  {
    id: 'taixu', name: '凡人', seal: '凡', short: '默认推荐 · 苏寒走的那条路',
    desc: '战败有牙齿：储物袋被搜、道伤缠身、死敌补刀；骗局池全开；资源限供（灵药按月按产区发货，采药时会有另一道神识锁定同一片山坡）；存档三格照旧。',
  },
  {
    id: 'tiandao', name: '天道', seal: '天', short: '单档自动盖写 · 死亡即碑',
    desc: '凡人档的全套凶险，再加一条：只有一座自动存档，随时盖写，无路可回。陨落之处立一座刻着你生平的碑，你的储物袋落在杀你的人手里——下一世的世界里，那座碑真在，那个人也真在。',
    warn: '此档死后本世即终结，只能另起一世。立下便不能再降。',
  },
];
export const DAO_TIER_IDX: Record<DaoTier, number> = { tianjiao: 0, taixu: 1, tiandao: 2 };
export function daoTierName(t: DaoTier) { return DAO_TIERS.find((x) => x.id === t)?.name ?? '凡人'; }
export function daoTierOf(t: DaoTier) { return DAO_TIERS.find((x) => x.id === t) ?? DAO_TIERS[1]; }

export const SECT_RANKS = ['外门弟子', '内门弟子', '核心弟子', '执事', '长老'];
export const SECT_RANK_NEED = [0, 300, 1200, 4000, 12000];  // 累计贡献
export const SECT_RANK_REALM = [1, 1, 2, 3, 3];             // 境界要求（大境界）

export function credName(c: number) {
  if (c >= 85) return '一诺千金';
  if (c >= 65) return '信义素著';
  if (c >= 45) return '尚可托付';
  if (c >= 30) return '口碑可疑';
  if (c >= 15) return '背信之徒';
  return '江湖骗子';
}

export function repName(rep: number) {
  if (rep >= 80) return '侠名远播';
  if (rep >= 40) return '正道称许';
  if (rep >= 12) return '小有善名';
  if (rep > -12) return '籍籍无名';
  if (rep > -40) return '风评不佳';
  if (rep > -80) return '恶名在外';
  return '魔头';
}
