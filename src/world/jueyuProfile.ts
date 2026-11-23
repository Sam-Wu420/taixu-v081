// 绝域的「险地配置」：一片越深入越凶险的地带，按离岸距离分带，每一项参数都是随深入程度渐变的曲线。
// 规则代码（world/jueyu.ts）只认这份配置，不写死「海」。
// 收官 B4：同一套规则铺到别界——介质（Medium）、天象换皮（WeatherSkin）、怪物表（BeastSkin）也进了配置；
// 六种样貌的配法与「按界的种子现配一份」在 world/jueyuLooks.ts。
import type { RGB } from '../gl/fx';
//
// 曲线的写法：at 是离岸距离（世界单位）的关键点，v 是对应的值；关键点之间用平滑插值（端点处斜率为 0），
// 所以带与带之间没有一条硬线。

/** 一条随离岸距离变化的曲线 */
export interface Curve { at: readonly number[]; v: readonly number[] }

export interface ZoneBand {
  id: 'near' | 'fog' | 'core' | 'abyss';
  name: string;
  /** 这一带从离岸多远开始（绝域另算：见 abyssFrom） */
  from: number;
  /** 第一次进这一带时的提示（一次性） */
  hint: string;
}

export interface ZoneProfile {
  id: string;
  /** 收官 B4：介质、天象的换皮、怪物表（无边海是海水、默认天象、原样的海兽） */
  medium: Medium;
  weather: WeatherSkin;
  /** 每种行为借哪只怪（null＝无边海原样）；mix 调各种怪出现的轻重（乘在原来的概率上） */
  beasts: Record<BeastKind, BeastSkin> | null;
  mix: Record<BeastKind, number>;
  /** 天象出现的频度倍率 */
  freq: { storm: number; ghost: number; rift: number };
  /** 本界的小险地（没有绝域；天象按小尺度排） */
  local?: boolean;
  /** 这片险地叫什么（界面上用） */
  name: string;
  bands: readonly ZoneBand[];
  /** 外圈那片没有对岸的地方：离岸超过它就是绝域，风力随深入增长到超过任何遁速 */
  abyssFrom: number;
  /** 绝域的风：每深入 scale 单位，风速翻 pow 次方地长；base 是 scale 处的风速（单位/秒） */
  abyssWind: { scale: number; base: number; pow: number };
  curves: {
    /** 飞行高度上限 */
    ceiling: Curve;
    /** 法力回复的倍率（1 照常，0.5 减半，0 不回） */
    regen: Curve;
    /** 法力流失的程度（0–1，乘上按境界查的每息流失量） */
    drain: Curve;
    /** 视野（1 正常，0.4 只剩四成；四周压暗，中间保持清楚） */
    view: Curve;
    /** 水色变暗变墨（0 碧蓝、1 黑水） */
    dark: Curve;
    /** 浪高（0–1） */
    swell: Curve;
    /** 暗紫裂隙光（0–1） */
    rift: Curve;
    /** 罗盘乱转（0 稳、1 乱转） */
    spin: Curve;
    /** 小地图锁死（超过 0.5 锁） */
    mapLock: Curve;
    /** 遁空梭能不能用（低于 0.5 失灵） */
    dunkong: Curve;
    /** 三种天象出现的频度（0–1） */
    storm: Curve; ghost: Curve; riftRate: Curve;
    /** 收官 B4：介质本身的「气」0–1（瘴的浓淡、冥雾、寒气、热浪）：额外的险按它算，着色器按它铺一层薄雾 */
    haze?: Curve;
  };
  /** 每息流失多少法力（占上限的比例），按境界编号查：凡人、炼气、筑基、结丹、元婴、化神 */
  drainByRealm: readonly number[];
  /** 落进去以后（泅水）：流失乘这个数；法力回到多少才能再起飞；移动速度的倍率 */
  swim: { drainK: number; takeoff: number; speed: number };
  /** 核心区偶发的「裂隙潮」：每个时段（秒）出一次的概率 */
  riftTide: { period: number; chance: number; count: [number, number] };
  /** 文字：落水、泅水、起飞不了、遁空失灵、法力流失的警示 */
  text: { fall: string; swim: string; noTakeoff: string; dunkong: string; drain: string; regen: string; lock: string; abyss: string };
}

// ================================================================ 收官 B4：介质、天象换皮、怪物表的类型
export type MediumKind = 'sea' | 'sand' | 'ice' | 'lava' | 'ming' | 'miasma';
export type BeastKind = 'guichi' | 'mochu' | 'liehai' | 'chuanling' | 'leiyao';
export interface Medium {
  kind: MediumKind;
  /** 介质叫什么（「海水」「流沙」……） */
  name: string;
  /** 着色器的颜色：mid 中段、deep 深处、glow 发光（裂隙 / 熔岩的亮 / 魂火）、foam 浪沫（沙脊、冰面、熔岩亮壳……） */
  palette: { mid: RGB; deep: RGB; glow: RGB; foam: RGB };
  /** 着色器：wave 波形（0 海浪 1 沙纹 2 浮冰 3 熔岩 4 冥河 5 瘴泽），emit 自发光，flow 流速 */
  look: { wave: number; emit: number; flow: number };
  /** 落进去以后每息掉多少气血（占上限；熔岩） */
  burn: number;
  /** 介质的「气」为 1 时每息掉多少气血：寒气（寒渊）、毒瘴（灵木）；引魂灯、林窗里免 */
  chill: number; toxic: number;
  /** 灵舟：any 都能行、high 只有宝船能行、none 行不得 */
  boat: 'any' | 'high' | 'none';
  /** 舟在这里叫什么（沙舟、冥舟……）；行不得时的说法 */
  boatWord: string; boatNo: string;
  /** 能不能下潜（海渊只在海里）；鬼船、祭坛（无边海的奇遇）放不放 */
  dive: boolean; qiyu: boolean;
  /** 浮冰（能落脚）的有无；热浪上升气流、引魂灯、林窗（每格出现的概率） */
  floes: number; thermal: number; lamps: number; glades: number;
  /** 天上下的是什么（雨丝、沙尘、雪、火雨、魂火、孢子）和颜色 */
  rain: { kind: 'rain' | 'sand' | 'snow' | 'ember' | 'wisp' | 'spore'; c: RGB };
}
export interface WeatherSkin {
  storm: { name: string };
  /** 落雷换皮：样子（bolt 雷、geyser 沙柱、icicle 冰锥、bomb 火山弹、hand 勾魂手、vine 毒藤）、颜色、挨上时的话 */
  strike: { name: string; fx: 'bolt' | 'geyser' | 'icicle' | 'bomb' | 'hand' | 'vine'; c: RGB; hit: string };
  /** 鬼雾换皮：雾色、幻影的墨色 */
  ghost: { name: string; mist: RGB; ink: RGB };
  rift: { name: string; c: RGB; deep: RGB; hit: string };
}
export interface BeastSkin {
  /** 用哪个 EnemyDef（data/seabeasts.ts 的 jy_*）；HD 场景里乘在贴图上的颜色、辉光 */
  def: string; name: string; tint: RGB; glow: RGB; glowK: number;
  /** 破水（出现）时的话；掉落：常见的、稀有的 */
  breach: string; drop: string; rare: string;
}
/** 无边海的天象（原样） */
export const SEA_WEATHER: WeatherSkin = {
  storm: { name: '飓风' },
  strike: { name: '落雷', fx: 'bolt', c: [0.7, 0.85, 1], hit: '一道落雷劈在身上！' },
  ghost: { name: '鬼雾', mist: [0.62, 0.68, 0.66], ink: [0.07, 0.09, 0.1] },
  rift: { name: '空间裂缝', c: [0.62, 0.22, 0.95], deep: [0.16, 0.02, 0.24], hit: '空间裂缝撕过肉身！' },
};
export const SEA_MEDIUM: Medium = {
  kind: 'sea', name: '海水', palette: { mid: [0.09, 0.2, 0.22], deep: [0.025, 0.035, 0.05], glow: [0.5, 0.16, 0.72], foam: [0.86, 0.9, 0.9] },
  look: { wave: 0, emit: 0, flow: 1 }, burn: 0, chill: 0, toxic: 0, boat: 'any', boatWord: '灵舟', boatNo: '', dive: true, qiyu: true,
  floes: 0, thermal: 0, lamps: 0, glades: 0, rain: { kind: 'rain', c: [0.78, 0.85, 0.92] },
};
export const ALL1: Record<BeastKind, number> = { guichi: 1, mochu: 1, liehai: 1, chuanling: 1, leiyao: 1 };

/** 无边海：第一份配置（数值说明见下面每一项的注释，「验证」见 tools/test-jueyu.ts 的模拟横渡） */
export const WUBIAN: ZoneProfile = {
  id: 'wubian', name: '无边海', medium: SEA_MEDIUM, weather: SEA_WEATHER, beasts: null, mix: ALL1, freq: { storm: 1, ghost: 1, rift: 1 },
  bands: [
    { id: 'near', name: '近海', from: 0, hint: '近海碧波，岛礁可依。再往外，海色转深，便是迷雾断层。' },
    { id: 'fog', name: '迷雾断层', from: 12000, hint: '入迷雾断层：海色转作墨青，涌浪渐大；神识受扰，灵力回复减半，飞得也越来越低——小地图已失准，罗盘开始乱转。' },
    { id: 'core', name: '核心海域', from: 34000, hint: '入无边海核心：黑水狂涛，空间紊乱。灵力每息都在流失、遁空梭失灵，只能贴着浪头飞——灵力见底就要落水。' },
    { id: 'abyss', name: '绝域', from: 45000, hint: '前方是绝域：罡风一阵猛过一阵，任何遁光都顶不住——再往里只会被吹回来。' },
  ],
  abyssFrom: 45000,
  // 深入 4000 时风速 1500/秒，8000 时约 4200，12000 时约 7800——化神催动遁光也不过两千七八
  abyssWind: { scale: 4000, base: 1500, pow: 1.5 },
  curves: {
    ceiling: { at: [0, 12000, 34000, 38000], v: [420, 420, 120, 60] },
    regen: { at: [0, 11000, 15000, 32000, 36500], v: [1, 1, 0.5, 0.5, 0] },
    drain: { at: [0, 32000, 37500], v: [0, 0, 1] },
    view: { at: [0, 12000, 34000], v: [1, 1, 0.4] },
    dark: { at: [0, 6000, 14000, 30000, 38000, 50000], v: [0, 0.06, 0.35, 0.62, 0.9, 1] },
    swell: { at: [0, 10000, 34000, 42000], v: [0.12, 0.22, 0.62, 1] },
    rift: { at: [0, 30000, 40000], v: [0, 0, 1] },
    spin: { at: [0, 12000, 22000, 34000], v: [0, 0, 0.45, 1] },
    mapLock: { at: [0, 11000, 13000], v: [0, 0, 1] },
    dunkong: { at: [0, 32500, 34500], v: [1, 1, 0] },
    storm: { at: [0, 10000, 22000, 36000], v: [0, 0, 0.55, 1] },
    ghost: { at: [0, 11000, 18000, 34000, 50000], v: [0, 0, 1, 0.75, 0.55] },
    riftRate: { at: [0, 18000, 34000, 46000], v: [0, 0, 0.35, 1] },
  },
  // 筑基、结丹约四十息见底（核心区不回气）；元婴平飞横穿核心约八成五；化神约三成
  drainByRealm: [0.03, 0.03, 0.026, 0.024, 0.0108, 0.0052],
  swim: { drainK: 0.35, takeoff: 0.12, speed: 0.35 },
  riftTide: { period: 50, chance: 0.4, count: [7, 11] },
  text: {
    fall: '灵力枯竭，遁光溃散——你一头栽进了海里！',
    swim: '泅水中',
    noTakeoff: '灵力不足一成，提不起遁光。服一枚回气的丹药，或者在水里慢慢缓过来。',
    dunkong: '空间紊乱，遁空梭的阵纹乱作一团，催动不得！',
    drain: '灵力流失',
    regen: '灵力回复减半',
    lock: '神识受扰',
    abyss: '罡风',
  },
};

/** 平滑插值：关键点之间 smoothstep */
export function curveAt(c: Curve, d: number): number {
  const a = c.at, v = c.v, n = a.length;
  if (d <= a[0]) return v[0];
  if (d >= a[n - 1]) return v[n - 1];
  let i = 1; while (d > a[i]) i++;
  const t = (d - a[i - 1]) / (a[i] - a[i - 1]), s = t * t * (3 - 2 * t);
  return v[i - 1] + (v[i] - v[i - 1]) * s;
}
