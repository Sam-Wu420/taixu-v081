// v0.53：阵法禁制——阵法与禁制本是一物：有人主持的叫阵法，前人留下、无人主持的叫禁制。
// 这里只放数据：可布之阵、阵道境界、阵盘品阶、阵图。玩法见 world/zhenfa.ts。

export type ZhenCat = '困' | '杀' | '守' | '辅' | '禁';
export interface ZhenDef {
  id: string; name: string; cat: ZhenCat;
  color: string;          // 'r,g,b'
  flags: number;          // 阵旗数
  realm: number;          // 最低境界
  zd: number;             // 阵道境界要求
  cost: number;           // 布阵所耗灵石（阵眼灵力）
  r: number;              // 半径（世界像素）
  dur: number;            // 持续（秒；聚灵阵按日计，见 days）
  days?: number;          // 按光阴计的持续（聚灵阵）
  img: string;            // 阵纹画材
  icon?: string;          // 阵法图标（v053 画材 id 或旧技能图标 id）
  /** 阵图出处：start=入门即会；shop=坊市阵图；ruin=遗府 / 秘境 */
  src: 'start' | 'shop' | 'ruin';
  desc: string;
}

export const ZHEN: ZhenDef[] = [
  { id: 'kun', name: '困阵', cat: '困', color: '96,216,208', flags: 4, realm: 1, zd: 0, cost: 60, r: 260, dur: 40, img: 'zf_kun', icon: 'kunzhen', src: 'start', desc: '四面阵旗锁住一方天地。阵中之敌走不出阵界，每隔三息被锁链缚住一回。困住一只妖兽、一个劫修，慢慢收拾。' },
  { id: 'juling', name: '聚灵阵', cat: '辅', color: '160,240,200', flags: 4, realm: 1, zd: 0, cost: 100, r: 220, dur: 0, days: 30, img: 'zf_juling', icon: 'juling', src: 'start', desc: '以灵石为眼，聚拢四方灵气。阵中打坐、闭关修炼速度大增（随阵盘与阵道而涨），法力回复加快。可维持一月光阴。' },
  { id: 'xuanwu', name: '玄武护阵', cat: '守', color: '122,200,255', flags: 4, realm: 1, zd: 1, cost: 200, r: 230, dur: 60, img: 'zf_xuanwu', icon: 'zs_xuanwu', src: 'shop', desc: '升起一座半球光罩：阵外飞来的法术、暗器尽数挡下，阵外之敌闯不进来，阵内所受伤害减四成。光罩挨打要耗阵眼灵力，灵力尽则阵破。' },
  { id: 'mizong', name: '迷踪阵', cat: '困', color: '208,216,224', flags: 6, realm: 1, zd: 1, cost: 120, r: 320, dur: 45, img: 'zf_mizong', icon: 'zs_mizong', src: 'shop', desc: '阵中浓雾翻涌、方位颠倒。阵中之敌时时失了你的踪迹，步履迟缓、原地打转。用来脱身、用来偷袭都好。' },
  { id: 'huichun', name: '回春阵', cat: '辅', color: '112,224,112', flags: 6, realm: 2, zd: 1, cost: 300, r: 240, dur: 40, img: 'zf_huichun', icon: 'zs_huichun', src: 'shop', desc: '乙木生机汇于阵中：你与同行之人在阵里气血持续回复。' },
  { id: 'wuxing', name: '颠倒五行阵', cat: '困', color: '230,200,120', flags: 5, realm: 2, zd: 2, cost: 400, r: 300, dur: 40, img: 'zf_wuxing', icon: 'diandao', src: 'shop', desc: '五行逆转，相生化相克。阵中之敌护体灵光紊乱，所受伤害增三成半，还会时时晕头转向。天星宗坊市的招牌阵法。' },
  { id: 'gengjin', name: '庚金剑阵', cat: '杀', color: '255,240,176', flags: 8, realm: 2, zd: 2, cost: 600, r: 300, dur: 30, img: 'zf_gengjin', icon: 'zs_gengjin', src: 'shop', desc: '八面阵旗化作八道庚金剑气，阵中剑光如雨，不停坠落在阵中之敌身上。' },
  { id: 'lianxi', name: '敛息阵', cat: '辅', color: '184,160,224', flags: 4, realm: 2, zd: 2, cost: 500, r: 220, dur: 60, img: 'zf_lianxi', icon: 'zs_lianxi', src: 'ruin', desc: '敛去阵中一切气息。你站在阵里，追兵的神识扫过只当是一片空山——除非贴到眼前。被追杀时的保命阵。' },
  { id: 'wulei', name: '五雷阵', cat: '杀', color: '176,160,255', flags: 5, realm: 2, zd: 3, cost: 900, r: 320, dur: 30, img: 'zf_wulei', icon: 'zs_wulei', src: 'ruin', desc: '五方雷旗引动天雷，阵中雷光连环劈落，中者麻痹。对魔物、鬼物威力倍增。' },
  { id: 'dihuo', name: '地火阵', cat: '杀', color: '255,122,58', flags: 6, realm: 3, zd: 3, cost: 1500, r: 300, dur: 30, img: 'zf_dihuo', icon: 'zs_dihuo', src: 'ruin', desc: '引地脉之火，阵中地面处处裂开喷出火柱，燎燃不绝。' },
  { id: 'liangyi', name: '两仪微尘阵', cat: '守', color: '200,215,240', flags: 2, realm: 3, zd: 4, cost: 2000, r: 230, dur: 45, img: 'zf_liangyi', icon: 'zs_liangyi', src: 'ruin', desc: '阴阳两仪流转不息：阵中所受伤害减两成，且三成反震回出手之人。只需两面阵旗，却极考验阵道。' },
];
export const ZHEN_BY_ID: Record<string, ZhenDef> = Object.fromEntries(ZHEN.map((z) => [z.id, z]));
/** 禁制（只出现在遗府、秘境、宗门；玩家不可布） */
export const JINZHI_IMG = { gujin: 'zf_gujin', hushan: 'zf_hushan' };

/** 阵道境界 */
export const ZD_NAME = ['未入阵道', '阵道入门', '初窥门径', '小有所成', '登堂入室', '炉火纯青', '一代阵法宗师'];
export const ZD_XP = [0, 20, 70, 170, 360, 680, 1150];
export function zdLevel(xp: number) { let l = 0; for (let i = 0; i < ZD_XP.length; i++) if (xp >= ZD_XP[i]) l = i; return l; }

/** v0.54.2：每座阵各自的精熟（布得越多、阵中困敌越多越熟）：威力、范围、时长、阵眼越来越强，圆满时省一面阵旗 */
export const ZM_NAME = ['初成', '小成', '大成', '圆满'];
export const ZM_XP = [0, 8, 25, 60];
export function zmLevel(xp: number) { let l = 0; for (let i = 0; i < ZM_XP.length; i++) if (xp >= ZM_XP[i]) l = i; return l; }
/** 精熟加成：威力 / 半径 / 时长 / 阵眼 / 灵石 */
export function zmBonus(lv: number) { return { pow: 1 + lv * 0.12, rad: 1 + lv * 0.06, dur: 1 + lv * 0.2, eye: 1 + lv * 0.25, cost: 1 - lv * 0.08 }; }
export const ZM_EVO = ['', '威力、范围、时长小增', '阵眼更坚，敌修难破', '圆满：省一面阵旗，威力大增'];

/** 阵盘：品阶决定威力、范围、可同时主持的阵数 */
export interface PanDef { id: string; name: string; tier: number; power: number; rad: number; max: number }
export const PANS: PanDef[] = [
  { id: 'zf_pan1', name: '木阵盘', tier: 1, power: 1, rad: 1, max: 1 },
  { id: 'zf_pan2', name: '铜阵盘', tier: 2, power: 1.18, rad: 1.06, max: 2 },
  { id: 'zf_pan3', name: '玉阵盘', tier: 3, power: 1.4, rad: 1.12, max: 2 },
  { id: 'zf_pan4', name: '古阵盘', tier: 4, power: 1.7, rad: 1.22, max: 3 },
];

/** 五行与相生（破禁之局：木 → 火 → 土 → 金 → 水 → 木） */
export type Wx = 'mu' | 'huo' | 'tu' | 'jin' | 'shui';
export const WX: Wx[] = ['mu', 'huo', 'tu', 'jin', 'shui'];
export const WX_NAME: Record<Wx, string> = { mu: '木', huo: '火', tu: '土', jin: '金', shui: '水' };
export const WX_COLOR: Record<Wx, string> = { mu: '#7ad8a0', huo: '#ff6a4a', tu: '#e8c460', jin: '#f2ead0', shui: '#5a9ae8' };
export const wxNext = (w: Wx): Wx => WX[(WX.indexOf(w) + 1) % 5];
