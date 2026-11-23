// 斗法版「斗法争锋」：敌方修士的储物袋 · 法器 · 宗门心法 · 遁速
// · 储物袋：炼气 800–2000 灵石、筑基 3000–10000，往上每个大境界约翻四倍；另有丹药、符箓、材料、妖丹、玉简
// · 法器：按境界配给（炼气至多 3 件 · 筑基至多 5 件 · 结丹至多 8 件 · 元婴不设上限），斗法时逐件祭出；
//         归墟鼎一类的至宝绝不配给，镇派重宝只有元婴后期才带得动几件
// · 斩杀之后，储物袋里的东西尽数掉落
// · 宗门心法：各派修士另修一门本宗心法（被动加成）与本宗秘传招式
// · 遁速：修士身法与你同表（按境界），不再沿用固定移速——这是此前「追不上、跑不掉、打得慢」的根子
import type { Combat, Enemy } from './combat';
import type { FoeSkill, SkKind, El } from './foeskills';
import type { StatusSpec } from '../data/arts';
import type { ItemDef, ArtKind } from '../data/items';
import { ITEMS, ITEM_LIST } from '../data/items';
import { REALMS } from '../data/realms';
import { canonOwned } from '../data/market';
import { SCHOOLS, schoolOf } from './schools';

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const rint = (a: number, b: number) => Math.floor(rand(a, b + 1));
const S = (o: Partial<FoeSkill> & { id: string; name: string; k: SkKind }, el: El): FoeSkill => ({ el, cd: 7, tele: 0.8, pow: 1.8, range: 520, ...o } as FoeSkill);
const ST: Record<string, StatusSpec> = {
  burn: { k: 'burn', dur: 3, ch: 0.5 }, slow: { k: 'slow', dur: 2.5, ch: 0.6 }, freeze: { k: 'freeze', dur: 1.2, ch: 0.5 }, shock: { k: 'shock', dur: 0.8, ch: 0.45 },
  poison: { k: 'poison', dur: 5, ch: 0.7 }, root: { k: 'root', dur: 1.5, ch: 0.85 }, stun: { k: 'stun', dur: 0.7, ch: 0.5 }, break: { k: 'break', dur: 4, ch: 0.5 }, knock: { k: 'knock', dur: 0.3, ch: 0.8 },
};
/** 各系法器 / 招式附带的状态 */
const EL_ST: Partial<Record<El, StatusSpec>> = { fire: ST.burn, ice: ST.slow, thunder: ST.shock, poison: ST.poison, blood: ST.break, ghost: ST.slow, water: ST.slow };

// ------------------------------------------------------------------ 遁速
/** 修士身法：与玩家同一张境界遁速表（九成二），不低于原先的固定移速。凡人武者不变。 */
export function humanSpeed(realm: number, base: number): number {
  if (realm < 1) return base;
  return Math.max(base, Math.round(REALMS[Math.min(5, realm)].speed * 0.92));
}
/** 这名修士此刻该有的基础移速（含飞行法器 / 心法加成）；追杀系统据此在远近之间切换 */
export function foeBase(e: Enemy): number {
  const g = (e as any).gear as FoeGear | undefined;
  return humanSpeed(e.realm, e.def.speed) * (g?.spdK ?? 1) * ((e as any).niSpd ?? 1);   // niSpd：敌修的沸血遁 / 沧浪遁（nitian.ts）
}

// ------------------------------------------------------------------ 储物袋
export interface FoeGear {
  /** 灵石 */
  stones: number;
  /** 法器（物品 id，品阶高的在前） */
  arts: string[];
  /** 丹药 / 符箓 / 材料 */
  items: { id: string; n: number }[];
  /** 本宗心法名、所属五行 */
  gongfa: string; el: El; sect: string;
  /** 灵气护罩加成（盾类法器、心法）/ 身法倍率 / 玉简 */
  wardK: number; spdK: number; scrollTier: number; scrollCh: number;
}

/** 储物袋灵石 [最少, 最多]：凡人 · 炼气 · 筑基 · 结丹 · 元婴 · 化神 */
export const BAG_STONES: [number, number][] = [[0, 0], [800, 2000], [3000, 10000], [12000, 40000], [50000, 160000], [200000, 600000]];
/** 法器件数上限（元婴起不设上限） */
export const ART_CAP = [0, 3, 5, 8, 99, 99];

function rollStones(realm: number, stage: number): number {
  const r = Math.min(5, realm), [lo, hi] = BAG_STONES[r], n = REALMS[r].stages.length;
  const t = Math.min(1, (stage + Math.random()) / Math.max(1, n));   // 小境界越高，家底越厚
  const v = lo + (hi - lo) * t * rand(0.7, 1);
  return Math.round(Math.max(lo, Math.min(hi, v)) / 10) * 10;
}

type XD = [string, number, number, number];   // [物品, 几率, 最少, 最多]
const EXTRA: XD[][] = [
  [],
  [['pill_huiqi', 0.8, 1, 3], ['pill_liaoshang', 0.7, 1, 2], ['pill_juqi', 0.5, 1, 2], ['pill_huanglong', 0.15, 1, 1], ['tal_fire', 0.6, 1, 3], ['tal_ice', 0.35, 1, 2], ['tal_thunder', 0.2, 1, 1],
    ['mat_yaodan1', 0.4, 1, 2], ['mat_tiejing', 0.4, 1, 3], ['herb_huangjing', 0.4, 1, 3], ['herb_lingzhi', 0.3, 1, 2], ['mat_lingquan', 0.25, 1, 2], ['pill_zhuji', 0.04, 1, 1]],
  [['pill_huiqi', 0.9, 2, 4], ['pill_liaoshang', 0.8, 2, 3], ['pill_juling', 0.5, 1, 2], ['pill_huanglong', 0.3, 1, 2], ['tal_thunder', 0.6, 1, 3], ['tal_fire', 0.5, 2, 4], ['tal_tianleizi', 0.25, 1, 1],
    ['mat_yaodan2', 0.45, 1, 2], ['mat_yaodan3', 0.3, 1, 1], ['mat_xuantie', 0.45, 1, 3], ['mat_chitong', 0.4, 1, 3], ['herb_xuelian', 0.35, 1, 2], ['herb_zihou', 0.12, 1, 1], ['mat_lingquan', 0.35, 1, 3], ['pill_zhuji', 0.15, 1, 1], ['pill_yanghun', 0.06, 1, 1]],
  [['pill_huiqi', 0.95, 3, 6], ['pill_liaoshang', 0.9, 3, 5], ['pill_ningyuan', 0.55, 1, 2], ['pill_juling', 0.4, 2, 3], ['tal_tianleizi', 0.5, 1, 2], ['tal_thunder', 0.6, 2, 4],
    ['mat_yaodan5', 0.4, 1, 1], ['mat_yaodan4', 0.45, 1, 2], ['mat_xuanyu', 0.5, 2, 4], ['mat_xuantie', 0.5, 2, 5], ['herb_bingpo', 0.3, 1, 2], ['herb_huolong', 0.25, 1, 2], ['mat_lingquan', 0.4, 2, 4], ['pill_jiangchen', 0.12, 1, 1], ['pill_yanghun', 0.12, 1, 1]],
  [['pill_huiqi', 1, 4, 8], ['pill_liaoshang', 1, 4, 8], ['pill_yuanling', 0.5, 1, 2], ['pill_ningyuan', 0.5, 2, 4], ['tal_tianleizi', 0.7, 2, 4],
    ['mat_yaodan7', 0.4, 1, 1], ['mat_yaodan6', 0.5, 1, 2], ['mat_xuanyu', 0.6, 4, 8], ['herb_xuejing', 0.3, 1, 2], ['herb_yangshen', 0.1, 1, 1], ['mat_lingquan', 0.5, 3, 6], ['pill_zifu', 0.08, 1, 1], ['pill_ningpo', 0.12, 1, 1], ['pill_wanshou', 0.05, 1, 1], ['pill_jiuqu', 0.06, 1, 1]],
];

// ------------------------------------------------------------------ 法器配给
/** 绝不配给的至宝（归墟鼎、云雷双翼、碧竹飞云剑、血色披风与三件六阶神物） */
const BAN = new Set(['art_xutian', 'art_xutianding', 'art_fenglei', 'art_qingzhu', 'art_xuese', 'art_xuepifeng', 'art_taixujianxia', 'art_zhoutianpan', 'art_jiuyoudeng']);
function banned(it: ItemDef): boolean {
  const a = it.art;
  return !a || !(it.price > 0) || it.tier >= 6 || BAN.has(it.id) || it.name.includes('鼎') || !!a.upgradable || canonOwned(it.id);
}
/** 镇派重宝（五阶、十三万灵石以上）：元婴后期才带得动 */
const isTop = (it: ItemDef) => it.tier >= 5 && it.price >= 130000;
const isEvilArt = (it: ItemDef) => it.art?.element === 'yin' || it.art?.element === 'blood';
const OFF = new Set<ArtKind>(['sword', 'needle', 'ring', 'mirror', 'slam', 'arrow', 'bell', 'bind', 'flame', 'banner', 'cauldron']);
const keyOf = (k: ArtKind) => (k === 'boots' || k === 'flight' || k === 'wings' ? 'move' : k);
const limOf = (key: string) => (key === 'move' || key === 'shield' || key === 'armor' ? 1 : key === 'sword' ? 3 : 2);
const ART_EL: Record<string, El> = { fire: 'fire', ice: 'ice', thunder: 'thunder', gold: 'gold', wood: 'wind', water: 'water', earth: 'earth', yin: 'ghost', blood: 'blood' };
const KIND_EL: Partial<Record<ArtKind, El>> = { sword: 'sword', needle: 'metal', ring: 'gold', mirror: 'gold', slam: 'earth', arrow: 'sword', bell: 'gold', bind: 'water', flame: 'fire', banner: 'wind', cauldron: 'earth', shield: 'gold' };

function weighted<T>(arr: T[], w: (x: T) => number): T | null {
  if (!arr.length) return null;
  const ws = arr.map(w); let r = Math.random() * ws.reduce((a, b) => a + b, 0);
  for (let i = 0; i < arr.length; i++) { r -= ws[i]; if (r <= 0) return arr[i]; }
  return arr[arr.length - 1];
}

function pickArts(e: Enemy, evil: boolean, el: El): string[] {
  const r = Math.min(5, e.realm), st = e.stage, late = r >= 5 || st >= (r === 1 ? 9 : 2), elite = !!(e.boss || e.affix);
  const all = ITEM_LIST.filter((it) => it.type === 'artifact' && !banned(it) && it.art!.reqRealm <= r && (evil || !isEvilArt(it)));
  // 品阶：炼气零至一阶（后期偶有二阶）· 筑基一至三阶 · 结丹三至四阶 · 元婴三至五阶（偏好高阶，含寻常古宝）
  const [lo, hi] = r <= 1 ? [0, late ? 2 : 1] : r === 2 ? [1, 3] : r === 3 ? [3, 4] : [3, 5];
  const pool = all.filter((it) => it.tier >= lo && it.tier <= hi && !(it.tier >= 5 && (r < 4 || isTop(it))));
  let n = r <= 1 ? rint(1, 1 + Math.min(2, Math.floor(st / 4))) : r === 2 ? rint(2, 3 + st) : r === 3 ? rint(4, 6 + st) : rint(8, 10 + st);
  if (elite) n++;
  n = Math.min(ART_CAP[r], n);
  const got: ItemDef[] = [], cnt: Record<string, number> = {};
  const w = (it: ItemDef) => {
    const a = it.art!; let k = Math.pow(2, it.tier - lo);   // 境界够了，自然挑好的用
    const ael = a.element ? ART_EL[a.element] : undefined;
    if (ael && ael === el) k *= 1.8;                           // 与本宗心法同系
    if (el === 'sword' && a.kind === 'sword') k *= 1.8;        // 剑修爱剑
    if (evil && isEvilArt(it)) k *= 1.6;                       // 魔修爱魔器
    return k;
  };
  const take = (from: ItemDef[], offOnly: boolean) => {
    const c = from.filter((it) => !got.includes(it) && (cnt[keyOf(it.art!.kind)] ?? 0) < limOf(keyOf(it.art!.kind)) && (!offOnly || OFF.has(it.art!.kind)));
    const it = weighted(c, w); if (!it) return false;
    got.push(it); const k = keyOf(it.art!.kind); cnt[k] = (cnt[k] ?? 0) + 1; return true;
  };
  for (let i = 0; i < n; i++) if (!take(pool, i === 0) && !take(pool, false)) break;
  // 结丹后期：偶有一件寻常古宝压箱底（仍在八件之内）
  if (r === 3 && late && Math.random() < (elite ? 0.6 : 0.35)) {
    const gu = all.filter((it) => it.tier === 5 && it.price <= 45000 && !got.includes(it));
    const it = weighted(gu, () => 1);
    if (it) { if (got.length >= ART_CAP[3]) got.pop(); got.push(it); }
  }
  // 元婴后期 / 化神：几件镇派重宝
  if (r >= 4 && late) {
    const tops = all.filter(isTop);
    const m = r >= 5 ? rint(2, 4) : rint(1, 3);
    for (let i = 0; i < m; i++) take(tops, false);
  }
  // 元婴老怪的家底不能只写在储物袋里：必有一面真正的护盾法器、一件鞋 / 飞行法器、
  // 一件护甲，且至少三件可祭出的古宝。所有这些仍经过 BAN / 六阶 / 可升级 / 原设归属过滤，
  // 绝不把云雷双翼、归墟鼎这类著名至宝塞给路人。
  if (r >= 4) {
    const put = (it: ItemDef | undefined) => {
      if (!it || got.includes(it)) return;
      got.push(it); const k = keyOf(it.art!.kind); cnt[k] = (cnt[k] ?? 0) + 1;
    };
    const hasKind = (k: string) => got.some((it) => keyOf(it.art!.kind) === k);
    if (!hasKind('shield')) {
      const shields = all.filter((it) => it.art!.kind === 'shield' && it.tier >= 4 && !isTop(it));
      if (!take(shields, false)) put(weighted(shields, (x) => x.tier));
    }
    // “鞋”与飞行法器都算 move：至少一件，保证元婴追兵和实战走位有真正的身法来源。
    if (!hasKind('move')) {
      const moves = all.filter((it) => keyOf(it.art!.kind) === 'move' && it.tier >= 3 && it.tier <= 4 && !isTop(it));
      put(weighted(moves, (x) => x.tier * (keyOf(x.art!.kind) === 'move' ? 1 : 0)));
    }
    // 鞋履单列：飞行法器之外，元婴必有一双真正的“鞋”（斗法里会踏出来用，见 foemind.treasures）。
    // 候选仍来自 all（已过 BAN / 六阶 / 可升级 / 原设归属过滤）且排除镇派重宝，不会拿到著名至宝。
    if (!got.some((it) => it.art!.kind === 'boots')) {
      const boots = all.filter((it) => it.art!.kind === 'boots' && it.tier >= 3 && !isTop(it));
      put(weighted(boots, (x) => x.tier) ?? undefined);
    }
    if (!hasKind('armor')) {
      const armors = all.filter((it) => it.art!.kind === 'armor' && it.tier >= 3 && it.tier <= 4 && !isTop(it));
      put(weighted(armors, (x) => x.tier));
    }
    const gu = all.filter((it) => it.tier >= 5 && !isTop(it) && artSkill(it));
    for (let guard = 0; got.filter((it) => it.tier >= 5 && artSkill(it)).length < 3 && guard < 16; guard++) {
      if (!take(gu, false)) { const it = gu.find((x) => !got.includes(x)); if (!it) break; got.push(it); }
    }
  }
  // 结丹修士：多半也备着一面护盾（仍在件数上限之内，同样只取寻常货色）
  if (r === 3 && got.length < ART_CAP[3] && !got.some((it) => it.art!.kind === 'shield') && Math.random() < 0.75) {
    const it = weighted(pool.filter((x) => x.art!.kind === 'shield'), (x) => 1 + x.tier);
    if (it) got.push(it);
  }
  got.sort((a, b) => b.tier - a.tier || b.price - a.price);
  return got.map((it) => it.id);
}

/** 法器 → 招式（先在地上亮预警，到点才落实；威力随法器品阶） */
function artSkill(it: ItemDef): FoeSkill | null {
  const a = it.art!, t = it.tier, el: El = (a.element && ART_EL[a.element]) || KIND_EL[a.kind] || 'gold';
  const id = 'fq_' + it.id, nm = it.name.replace(/（.*?）/g, ''), st = EL_ST[el];
  switch (a.kind) {
    case 'sword': return S({ id, name: `御剑·${nm}`, k: 'salvo', n: t >= 5 ? 3 : t >= 3 ? 2 : 1, waves: 3, spread: 0.24, tele: 0.3, pow: 0.72 + 0.07 * t, range: 620, min: 100, cd: 6.5 - 0.2 * t, status: st }, el);
    case 'needle': return S({ id, name: `飞针·${nm}`, k: 'salvo', n: 5 + Math.min(2, t >> 1), waves: t >= 3 ? 2 : 1, spread: 0.95, tele: 0.35, pow: 0.46 + 0.05 * t, range: 560, min: 110, cd: 6.5, status: st }, el);
    case 'ring': return S({ id, name: `祭·${nm}`, k: 'track', waves: 3 + (t >= 5 ? 1 : 0), r: 90, tele: 0.75, gapT: 0.5, pow: 1.15 + 0.07 * t, range: 620, cd: 10, status: st }, el);
    case 'mirror': return S({ id, name: `镜光·${nm}`, k: 'beam', len: 660, w: 54, tele: 0.6, dur: 0.3, pow: 1.8 + 0.12 * t, range: 620, min: 100, cd: 8.5, status: st }, el);
    case 'slam': return S({ id, name: `镇压·${nm}`, k: 'circle', r: 140 + t * 6, tele: 0.95, pow: 2.1 + 0.16 * t, range: 600, cd: 10.5, status: ST.stun }, el);
    case 'arrow': return S({ id, name: nm.startsWith('符宝') ? nm : `激发·${nm}`, k: 'beam', len: 720, w: 38, tele: 0.45, dur: 0.22, pow: 2.0 + 0.14 * t, range: 680, min: 140, cd: 9.5, status: st }, el);
    case 'bell': return S({ id, name: `震·${nm}`, k: 'nova', r: 230, tele: 0.65, pow: 1.25 + 0.07 * t, range: 220, cd: 11, status: { k: 'stun', dur: 0.8, ch: 0.6 } }, el);
    case 'bind': return S({ id, name: `缚·${nm}`, k: 'circle', r: 112, tele: 0.7, pow: 0.9 + 0.06 * t, range: 600, cd: 11.5, status: ST.root }, el);
    case 'flame': return S({ id, name: `焚·${nm}`, k: 'cone', r: 320, spread: 0.6, tele: 0.6, pow: 1.6 + 0.1 * t, range: 300, cd: 8.5, status: st ?? ST.burn, pool: 2.5 }, el);
    case 'banner': return S({ id, name: `展·${nm}`, k: 'rain', n: 5 + (t >= 4 ? 1 : 0), r: 88, tele: 0.95, pow: 1.2 + 0.09 * t, range: 620, cd: 11, status: st, pool: 2 }, el);
    case 'cauldron': return S({ id, name: `摄·${nm}`, k: 'circle', r: 130, tele: 0.85, pow: 1.5 + 0.1 * t, range: 580, cd: 11, pull: 200 }, el);
    case 'shield': return S({ id, name: `祭·${nm}`, k: 'guard', dur: 3.5 + Math.min(2, t * 0.4), tele: 0.3, pow: 0, range: 800, cd: 15 }, el);
  }
  return null;
}

// ------------------------------------------------------------------ 宗门心法与秘传
interface Gongfa { n: string; hp?: number; atk?: number; def?: number; spd?: number; ward?: number; cad?: number }
/** 各系心法：被动加成（气血 / 攻 / 防 / 身法 / 护罩 / 出手间隔） */
const GF: Record<El, Gongfa> = {
  sword: { n: '剑诀', atk: 1.1, spd: 1.04 }, metal: { n: '庚金诀', atk: 1.1 }, gold: { n: '金光诀', atk: 1.06, ward: 0.05 },
  ice: { n: '玄冰诀', hp: 1.08, ward: 0.06 }, water: { n: '若水诀', hp: 1.14 }, fire: { n: '离火诀', atk: 1.08, cad: 0.92 },
  thunder: { n: '御雷诀', atk: 1.06, cad: 0.9 }, earth: { n: '厚土诀', def: 1.25, hp: 1.08 }, phys: { n: '锻体诀', hp: 1.16, def: 1.12 },
  wind: { n: '乘风诀', spd: 1.12, cad: 0.94 }, poison: { n: '万毒经', atk: 1.05, hp: 1.08 }, ghost: { n: '幽冥录', hp: 1.1, ward: 0.04 }, blood: { n: '血煞功', atk: 1.12 },
};
const lines = (id: string, name: string, el: El, o: Partial<FoeSkill> = {}) => S({ id, name, k: 'lines', n: 3, spread: 0.7, len: 560, w: 44, tele: 0.65, dur: 0.28, pow: 1.5, range: 520, min: 180, cd: 9, ...o }, el);
const march = (id: string, name: string, el: El, o: Partial<FoeSkill> = {}) => S({ id, name, k: 'march', n: 5, r: 78, tele: 0.6, gapT: 0.13, pow: 1.6, range: 560, min: 90, cd: 9, ...o }, el);
const track = (id: string, name: string, el: El, o: Partial<FoeSkill> = {}) => S({ id, name, k: 'track', waves: 3, r: 88, tele: 0.8, gapT: 0.55, pow: 1.35, range: 600, cd: 10, ...o }, el);
const spiral = (id: string, name: string, el: El, o: Partial<FoeSkill> = {}) => S({ id, name, k: 'spiral', n: 3, waves: 9, gapT: 0.1, spread: 0.42, tele: 0.5, pow: 0.6, range: 520, cd: 10, ...o }, el);
/** 各系秘传：[最低境界, 招式]（名字前会冠上本宗名号） */
const MI: Record<El, [number, FoeSkill][]> = {
  sword: [[2, lines('gs_sword2', '万剑朝宗', 'sword', { n: 5, spread: 0.95 })], [3, spiral('gs_sword3', '剑轮回旋', 'sword', { n: 4, pow: 0.62 })]],
  metal: [[2, spiral('gs_metal2', '金针暴雨', 'metal')], [3, march('gs_metal3', '裂金连斩', 'metal', { status: ST.break, pow: 1.7 })]],
  gold: [[2, track('gs_gold2', '金光伏魔印', 'gold')], [3, lines('gs_gold3', '大日金光', 'gold', { n: 4, pow: 1.7 })]],
  ice: [[2, march('gs_ice2', '冰川突进', 'ice', { status: ST.slow })], [3, S({ id: 'gs_ice3', name: '玄冰封界', k: 'circle', r: 175, tele: 1.0, pow: 1.9, range: 600, cd: 13, status: ST.freeze, pool: 3 }, 'ice')]],
  fire: [[2, spiral('gs_fire2', '流火飞星', 'fire', { status: ST.burn })], [3, track('gs_fire3', '三昧真火', 'fire', { waves: 4, status: ST.burn, pool: 2.5 })]],
  thunder: [[2, track('gs_thunder2', '九霄神雷', 'thunder', { waves: 4, gapT: 0.45, status: ST.shock })], [3, lines('gs_thunder3', '天罗雷网', 'thunder', { n: 5, spread: 1.0, status: ST.shock })]],
  earth: [[2, march('gs_earth2', '裂地突岩', 'earth', { status: ST.stun })], [3, S({ id: 'gs_earth3', name: '山岳震', k: 'nova', r: 220, tele: 0.65, pow: 1.7, range: 200, cd: 10, pull: -180, status: ST.knock }, 'earth')]],
  wind: [[2, spiral('gs_wind2', '青岚风刃', 'wind')], [3, lines('gs_wind3', '裂空罡风', 'wind', { n: 4, status: ST.knock })]],
  poison: [[2, S({ id: 'gs_poison2', name: '腐骨毒瘴', k: 'circle', r: 150, tele: 0.9, pow: 1.4, range: 580, cd: 11, status: ST.poison, pool: 4 }, 'poison')], [3, S({ id: 'gs_poison3', name: '噬灵蛊', k: 'circle', r: 115, tele: 0.8, pow: 1.5, range: 560, cd: 10, leech: 0.07 }, 'poison')]],
  ghost: [[2, track('gs_ghost2', '幽魂索命', 'ghost', { status: ST.slow })], [3, S({ id: 'gs_ghost3', name: '摄魂夺魄', k: 'circle', r: 120, tele: 0.8, pow: 1.6, range: 580, cd: 10, leech: 0.07 }, 'ghost')]],
  blood: [[2, S({ id: 'gs_blood2', name: '血煞噬元', k: 'cone', r: 220, spread: 0.65, tele: 0.5, pow: 1.5, range: 210, cd: 8, leech: 0.06 }, 'blood')], [3, lines('gs_blood3', '血河滔天', 'blood', { n: 4, status: ST.break })]],
  water: [[2, march('gs_water2', '怒涛连击', 'water', { status: ST.slow })], [3, S({ id: 'gs_water3', name: '玄水缚龙', k: 'beam', len: 600, w: 42, tele: 0.6, dur: 0.25, pow: 1.4, range: 580, min: 220, cd: 10, pull: 240 }, 'water')]],
  phys: [[2, S({ id: 'gs_phys2', name: '贴山靠', k: 'charge', len: 520, w: 84, tele: 0.6, pow: 2.0, range: 480, min: 120, cd: 8, status: ST.knock }, 'phys')], [3, S({ id: 'gs_phys3', name: '崩山劲', k: 'nova', r: 210, tele: 0.7, pow: 2.0, range: 190, cd: 10, status: ST.stun }, 'phys')]],
};

// ------------------------------------------------------------------ 生成
/** 凡人武者、尸傀不带储物袋 */
const NO_GEAR = new Set(['yelang', 'jiatianlong', 'duba', 'ouyang', 'quhun_foe', 'mo_body']);
export function hasGear(e: Enemy): boolean {
  const E = e as any;
  return e.def.kind === 'human' && e.realm >= 1 && !e.spar && !e.ally && !e.minion && !E.shell && !E.ying && !NO_GEAR.has(e.def.id) && !e.def.id.endsWith(':ying');
}

/** 这名修士的储物袋（首次用到时生成，并把心法 / 护甲 / 飞行法器的被动加成落到身上） */
export function gearOf(e: Enemy): FoeGear | null {
  const E = e as any;
  if (E.gear) return E.gear as FoeGear;
  if (!hasGear(e)) return null;   // 不缓存：切磋 / 同阵的身份可能变
  const r = Math.min(5, e.realm);
  let sid = 'sanxiu';
  try { sid = schoolOf(e) || 'sanxiu'; } catch { /* 门派掷不出来就当散修 */ }
  const sc = SCHOOLS[sid], evil = !!(e.def.evil || sc?.evil), el: El = sc?.el ?? 'fire', gf = GF[el] ?? GF.fire;
  let arts: string[] = [];
  try { arts = pickArts(e, evil, el); } catch { arts = []; }
  const items: { id: string; n: number }[] = [];
  for (const [id, ch, lo, hi] of EXTRA[Math.min(4, r)] ?? []) if (ITEMS[id] && Math.random() < ch) items.push({ id, n: rint(lo, hi) });
  const g: FoeGear = {
    stones: rollStones(r, e.stage), arts, items,
    gongfa: `${sc?.name ?? '散修'}·${gf.n}`, el, sect: sc?.name ?? '散修',
    wardK: gf.ward ?? 0, spdK: gf.spd ?? 1, scrollTier: Math.min(4, r), scrollCh: [0, 0.25, 0.35, 0.45, 0.6, 0.7][r],
  };
  // 被动：心法（炼气只得六成火候）
  const k = r <= 1 ? 0.6 : 1, sc1 = (v?: number) => (v ? 1 + (v - 1) * k : 1);
  let hpK = sc1(gf.hp), defK = sc1(gf.def);
  e.atk *= sc1(gf.atk);
  // 元婴人修的“老怪底蕴”：不是单纯把玩家境界表抬高，而是专给 NPC 气血 / 攻防 / 护罩加成。
  // 小境界越高越明显，后期元婴才有真正压场的气血与杀伤。
  // v0.72 再加强（玩家普遍反馈元婴太弱）：气血 ×1.60~1.84、攻 ×1.32~1.46、防 ×1.30~1.42；化神再高一档。
  const top = r >= 5 ? 0.12 : 0;
  const oldMonster = r >= 4 ? 1 + 0.6 + Math.min(2, e.stage) * 0.12 + top : 1;
  const highAtk = r >= 4 ? 1 + 0.32 + Math.min(2, e.stage) * 0.07 + top * 0.5 : 1;
  const highDef = r >= 4 ? 1 + 0.3 + Math.min(2, e.stage) * 0.06 + top * 0.5 : 1;
  hpK *= oldMonster; defK *= highDef; e.atk *= highAtk;
  if (r >= 4) g.wardK += 0.12;
  if (gf.cad) E.gfCad = 1 - (1 - gf.cad) * k;
  // 被动：护甲、盾、飞行法器
  for (const id of arts) {
    const a = ITEMS[id]?.art; if (!a) continue;
    if (a.kind === 'armor') defK *= 1 + (a.def ?? 0.15) * 0.8;
    else if (a.kind === 'shield') g.wardK += (a.absorb ?? 0.6) * 0.12;
    else if (a.kind === 'boots' || a.kind === 'flight' || a.kind === 'wings') g.spdK *= 1 + ((a.mapSpeed ?? 1.2) - 1) * 0.3;
  }
  g.spdK = Math.min(r >= 4 ? 1.22 : 1.15, g.spdK);   // 飞行法器再好，身法加成也有个头
  if (hpK !== 1) { const f = e.hp / Math.max(1, e.maxHp); e.maxHp = Math.round(e.maxHp * hpK); e.hp = Math.round(e.maxHp * f); }
  e.dfn *= defK;
  e.speed *= g.spdK;
  E.gear = g;
  return g;
}

/** 法器招式 + 本宗秘传（并入修士的招式表） */
export function gearKit(e: Enemy): FoeSkill[] {
  const g = gearOf(e); if (!g) return [];
  const out: FoeSkill[] = [];
  for (const id of g.arts) { const it = ITEMS[id]; const s = it?.art ? artSkill(it) : null; if (s) out.push(s); }
  for (const [m, s] of MI[g.el] ?? []) if (e.realm >= m) out.push({ ...s, name: `${g.sect}秘传·${s.name}` });
  return out;
}

/** 法器名（给飘字 / 提示用） */
export function gearNames(g: FoeGear, max = 3): string {
  const ns = g.arts.slice(0, max).map((id) => ITEMS[id]?.name ?? '').filter(Boolean);
  return ns.join('、') + (g.arts.length > max ? '等' : '');
}

/** 斩杀：储物袋里的东西尽数掉落（k < 1 = 死于旁人之手，被摸走了一部分） */
export function dropGear(c: Combat, e: Enemy, k = 1) {
  const E = e as any;
  if (E.gearDropped) return;
  const g = gearOf(e); if (!g) return;
  E.gearDropped = true;
  const loot = (c as any).loot as { x: number; y: number; id: string; n: number; t: number }[];
  const put = (id: string, n: number) => { if (n >= 1 && ITEMS[id]) loot.push({ x: e.x + rand(-120, 120), y: e.y + rand(-70, 70), id, n: Math.round(n), t: 0 }); };
  const stones = Math.round(g.stones * k);
  put('mat_lingshi', stones);
  let na = 0, ni = 0;
  for (const id of g.arts) if (k >= 1 || Math.random() < k) { put(id, 1); na++; }
  for (const it of g.items) if (k >= 1 || Math.random() < k) { put(it.id, it.n); ni++; }
  if (Math.random() < g.scrollCh * k) { const sk = c.randomScroll(g.scrollTier); if (sk) { put(sk, 1); ni++; } }
  const gm = c.game, p = gm.player;
  if (Math.hypot(e.x - p.x, e.y - p.y) < 1800) {
    gm.toast(`${e.name}的储物袋散落一地：灵石 ${stones}${na ? `、法器 ${na} 件（${gearNames(g)}）` : ''}${ni ? `、丹药符箓等 ${ni} 样` : ''}。`, 'good');
  }
}
