import { guidanceInfoVisible } from './guidanceFilter';
import { baseSenseRange } from './senseRange';
import { MY_SECT_ID, X_ROBE, X_DEMON } from '../data/sects';
import { applySectUniform } from '../gfx/sectUniform';
// 第四步：人界众生（NPC AI）
// - 每个修士都是一个“人”：姓名、境界、门派、性格、目标、钱财、对你的好感与仇怨
// - 神识外：粗略模拟（赶路、闭关、突破、衰老、坐化、死于险地）；神识附近：完整行为（走/飞/打坐/采药/斗法/劫道/逃命）
// - 互相以神识感知：比你强又贪婪的会来劫道；比你弱的见你恶名会逃；你可以交谈、交易、切磋、赠礼、请教、出手
import { supMul, drawSupUnder, drawSupOver, supSquash, SUP_COL_P } from './suppress';
import type { Game } from './game';
import { CharState, drawCharacter, drawSwordUnderFeet, randomLook, Look, NpcRole } from '../gfx/character';
import { charFrames, CHAR_FRAME_SCALE, getDotSprite, getShadowSprite } from '../gfx/charAtlas';
import { hasBeastSprite, drawBeastSprite, charAnim } from '../gfx/beastTex';
import { modx } from '../mod/hooks';
import { LOCATIONS, LOC_BY_ID, WORLD_SCALE, WORLD_W, WORLD_H, LocDef, ACTIVE_MAP, ACTIVE_WORLD, ALL_MAP_IDS, MAP_IDS, locHere, locsOf, MapId } from '../data/world';
import { WORLDS, worldOfMap, worldRealmCap, worldCurrencyId, worldCurrencyName, worldStatScale, worldSpeedScale, type WorldId } from '../data/worldHierarchy';
import { REALMS, realmName, pickNpcRoot } from '../data/realms';
/** 名牌烘焙：把「描边 + 文字」画进一张小图，文本/字号/颜色不变就一直复用。
 *  之前每帧对每个人 strokeText + fillText，等于每帧重排字形、重解析字体字符串。 */
const LABEL_CACHE = new Map<string, HTMLCanvasElement>();
const LABEL_MAX = 420;
const LABEL_PAD = 4;
let labelCtx: CanvasRenderingContext2D | null = null;
const LABEL_FONT = (px: number) => `${px}px "Noto Serif SC","Songti SC",serif`;
function labelSprite(text: string, fs: number, color: string, res: number): HTMLCanvasElement {
  const key = `${res}|${fs}|${color}|${text}`;
  const hit = LABEL_CACHE.get(key);
  if (hit) return hit;
  if (!labelCtx) { const c = document.createElement('canvas'); c.width = c.height = 8; labelCtx = c.getContext('2d'); }
  const m = labelCtx!;
  m.font = LABEL_FONT(fs * res);
  const w = Math.max(2, Math.ceil(m.measureText(text).width + LABEL_PAD * res * 2));
  const h = Math.max(2, Math.ceil(fs * res * 1.55));
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d')!;
  g.font = LABEL_FONT(fs * res); g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 3 * res; g.strokeStyle = 'rgba(20,16,12,0.7)';
  g.strokeText(text, w / 2, h / 2);
  g.fillStyle = color; g.fillText(text, w / 2, h / 2);
  if (LABEL_CACHE.size >= LABEL_MAX) LABEL_CACHE.delete(LABEL_CACHE.keys().next().value as string);
  LABEL_CACHE.set(key, cv);
  return cv;
}import { mulberry32 } from '../core/rng';
import { ENEMIES } from '../data/enemies';
import { Enemy } from './combat';
import * as C from './cultivation';
import { ITEM_LIST, itemDef } from '../data/items';
import type { DNode, DOpt, ShopStock } from './modal';
import { BEAUTY_BY_ID, BEAUTIES, beautyLook } from '../data/beauties';
import type { Tie, Bond } from './relations';
import type { Hate, Plan, Bio } from './living';
import { TIER_COLOR, relWord as relWordOf } from './relations';
import { Roster } from './roster';
import { zoneOfLoc, sellableAt, priceMul, yaodanCap, pzOf } from '../data/market';
import { capRealm, canHoldRogueYuanying, rogueRealmAt } from './demog';
import { pickAlive, tickAlive, reactTick, exclaimAll, maybeParade, drawAliveUnder, drawAliveOver, drawMindBubble, ALIVE_NAME } from './alive';

type G = CanvasRenderingContext2D;
export type Pers = 'righteous' | 'greedy' | 'cautious' | 'arrogant' | 'kind' | 'ruthless' | 'aloof';
export const PERS_NAME: Record<Pers, string> = { righteous: '正直', greedy: '贪婪', cautious: '谨慎', arrogant: '傲慢', kind: '温和', ruthless: '狠辣', aloof: '淡泊' };
export type Faction = 'sect' | 'rogue' | 'demon' | 'mortal' | 'merchant';
type Goal = 'travel' | 'stay' | 'seclude' | 'hunt' | 'gather';

export interface NpcData {
  id: string; name: string; sex: 'm' | 'f'; role: NpcRole;
  realm: number; stage: number; faction: Faction; sect?: string; home: string;
  pers: Pers; favor: number; shown?: number; grudge: number; met: boolean; alive: boolean;
  age: number; life: number; x: number; y: number; tx: number; ty: number;
  goal: Goal; until: number; wealth: number; seed: number;
  canon?: boolean; title?: string; beauty?: string; robe?: string; stay?: boolean;
  taught?: boolean; lastTalk?: number; deathNote?: string; spar?: number; hidden?: boolean;
  map?: MapId;              // 所在地图（缺省为南荒）
  /** 出身界域（高界修士逆返人界时保留真实出身界域，读档不按人界上限降阶） */
  originWorld?: WorldId;
  // ---------- 第二十九步：人脉与恩怨 ----------
  ties?: Tie[]; why?: string; huntAt?: number; hunting?: boolean; huntStart?: number; vend?: string; oath?: boolean;
  /** 第三十二步：正亲自追杀中（由追杀系统接管） / 追杀失败的次数（下次更有准备） */
  chasing?: boolean; prep?: number;
  /** v0.64：遣人代为出手而失手的次数（满两次，才「迫不得已」亲自对小辈出手） */
  proxyFail?: number;
  bond?: Bond; bondUntil?: number; helpUntil?: number; helpUntilDay?: number; lastParley?: number; lunDao?: number; home0?: string; orig?: boolean; vow?: boolean;
  /** 第三十六步：宗门名册上的门人（宗门 id / 名册序号） */
  ros?: string; rosI?: number;
  /** 第四十步：大城坐镇名册（城池 id / 序号） */
  gz?: string; gzI?: number;
  /** 第四十三步：活世界——储物袋（物品 id → 数量；灵石仍记在 wealth）、所习功法玉简、主修功法、仇恨、眼下的打算、生平、宗门职位 / 贡献、伤期 / 丧期、出生日、死于谁手 */
  bag?: Record<string, number>; arts?: string[]; gf?: string; hate?: Hate[]; plan?: Plan; bio?: Bio[];
  srk?: number; ctb?: number; inj?: number; grief?: number; griefWhy?: string; born?: number; kb?: string;
  /** 修炼速率倍率（随任务资源、丹药、灵脉动态提升）、修炼灵源储备、已完成差事/任务次数 */
  cultRate?: number; resScore?: number; taskDone?: number;
  /** v0.72：灵根资质 id（与主角共用 ROOTS 表）与临时漫游散修标记 */
  root?: string;
  transient?: boolean;
  /** v0.56：模组 NPC——所属模组 id、外貌覆盖 */
  mod?: string; mlook?: Partial<Look>;
}
export const npcMap = (d: NpcData): MapId => d.map ?? 'renjie';
/** 各图常住修士 / 凡人数量 */
const POP: Record<MapId, number> = {
  renjie: 1080,
  lingjie: 270,
  xianjie: 210,
};   // v0.54：散修多一些；灵仙界按界按需懒生成并封存防膨胀

export interface Active {
  d: NpcData; st: CharState; look: Look;
  act: 'walk' | 'idle' | 'sit' | 'gather' | 'fly' | 'duel' | 'flee' | 'approach' | 'follow';
  t: number; wait: number; enemy?: Enemy; noticed: number;
  duel?: { foe: Active; hp: number; cd: number; t: number };
  hp: number; bubble?: { text: string; t: number; mind?: boolean; gold?: boolean; crack?: boolean }; bolts: { x: number; y: number; x2: number; y2: number; t: number; col: string }[];
  ally?: Enemy | null; allyCd: number;
  /** 一次性施法动作剩余时间：助战出手后保持 cast 0.35s，避免下一帧被基础动作覆盖 */
  castT?: number;
  /** 第二十九步：日常（钓鱼 / 摆摊 / 闲聊 / 围观） */
  life?: { k: 'fish' | 'stall' | 'chat' | 'watch' | import('./alive').AliveK; dir: number; with?: Active; lines?: string[]; li?: number; lt?: number; cx?: number; cy?: number; ware?: number; ph?: number; n?: number };
  /** 第四十六步：心声计时 / 上一句心声 / 反应冷却 */
  mindT?: number; mindLast?: string; reactCd?: number;
  parley?: boolean;
  /** 第四十一步：被你的威压压制（1 举步维艰 · 2 镇压）/ 已持续 */
  sup?: number; supOn?: number;
  /** P5 错帧累计步长 */
  accDt?: number;
}

const SECT_ROBE: Record<string, string> = {
  huangfeng: '#c9a24a', yanyue: '#e8e4ee', lingshou: '#6a7a4a', qingxu: '#7a9ab0', huadao: '#5a5a62', tianque: '#8a6a4a', jujian: '#4a5a6a',
  luoyun: '#4f8a8a', gujian: '#6a8aa0', baiqiao: '#8a7a5a', guiling: '#2a2a34', hehuan: '#c87a96', yuling: '#4a3a5a', qianhuan: '#7a4a8a',
  tiansha: '#3a1a1a', yinluo: '#2a3a2a', tianmo: '#5a1418', taiyi: '#e0dccc', huayi: '#6a7a9a', qianzhu: '#3a6a3a', tianlan: '#d8c890', miaoyin: '#b8a0d0', qixuan: '#5a6a5a',
};
Object.assign(SECT_ROBE, X_ROBE);   // v0.60：新宗门袍色
const DEMON_SECTS = new Set(['guiling', 'hehuan', 'yuling', 'qianhuan', 'tiansha', 'yinluo', 'tianmo', ...X_DEMON]);
const SURN = '韩李王张刘陈杨赵黄周吴徐孙马朱胡林郭何高罗郑梁谢宋唐许冯邓曹彭曾萧田董潘袁蔡蒋余叶程苏魏吕丁沈任姚卢钟陆白秦尹孟温柳欧阳慕容上官司马';
const MN = ['云', '风', '清', '玄', '明', '远', '松', '鹤', '天', '道', '一', '真', '平', '岳', '霄', '尘', '泽', '峰', '石', '江', '海', '仁', '义', '飞', '鸿', '啸', '铁', '虎', '青', '墨', '寒', '冥', '烈', '浩', '谦', '恒'];
const FN = ['婉', '月', '雪', '灵', '儿', '秀', '芸', '霜', '凝', '烟', '琴', '瑶', '思', '玉', '蓉', '菲', '素', '青', '璇', '若', '紫', '晴', '湘', '莲'];
const COMPOUND = ['欧阳', '慕容', '上官', '司马'];

/** 第三十六步：宗门 → 流派（名册新增宗门） */
const SCHOOL_ALIAS: Record<string, string> = { tianxing: 'xinggong', leikong: 'nixing', tianlan: 'mulan', mulan: 'mulan', yejia: 'taiyi', miaoyin: 'miaoyin' };
export const SECT_ROBE_OF = (sid: string) => SECT_ROBE[sid];
export function makeName(rnd: () => number, sex: 'm' | 'f') {
  let s: string;
  const r = rnd();
  if (r < 0.06) s = COMPOUND[Math.floor(rnd() * COMPOUND.length)];
  else { const plain = SURN.replace(/欧阳|慕容|上官|司马/g, ''); s = plain[Math.floor(rnd() * plain.length)]; }
  const pool = sex === 'f' ? FN : MN;
  const n = rnd() < 0.55 ? pool[Math.floor(rnd() * pool.length)] + pool[Math.floor(rnd() * pool.length)] : pool[Math.floor(rnd() * pool.length)];
  return s + n;
}
const lv = (r: number, s: number) => r * 13 + s;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const TAU = Math.PI * 2;

// ---------------------------------------------------------------- 原著人物（自由发展：性格还原，命运由你改写）
interface CanonDef { id: string; name: string; sex: 'm' | 'f'; home: string; realm: number; stage: number; pers: Pers; faction: Faction; title: string; role: NpcRole; robe?: string; stay?: boolean; age: number; orig?: boolean; favor?: number }
const CANON: CanonDef[] = [
  { id: 'modaifu', name: '邹大夫', sex: 'm', home: 'qixuan', realm: 1, stage: 4, pers: 'ruthless', faction: 'rogue', title: '青玄门回春谷', role: 'elder', robe: '#4a4a44', stay: true, age: 62 },
  { id: 'lifeiyu', name: '方啸云', sex: 'm', home: 'qixuan', realm: 0, stage: 0, pers: 'righteous', faction: 'mortal', title: '青玄门弟子', role: 'guard', robe: '#3a4a5a', age: 18 },
  { id: 'lihuayuan', name: '严化尘', sex: 'm', home: 'huangfeng', realm: 3, stage: 0, pers: 'righteous', faction: 'sect', title: '青霞谷结丹长老', role: 'cultivator', robe: '#b08a3a', age: 260 },
  { id: 'linghu', name: '公孙老祖', sex: 'm', home: 'huangfeng', realm: 4, stage: 0, pers: 'aloof', faction: 'sect', title: '青霞谷老祖', role: 'elder', robe: '#c9a24a', stay: true, age: 680 },
  { id: 'leiwanhe', name: '风万鹤', sex: 'm', home: 'huangfeng', realm: 3, stage: 1, pers: 'righteous', faction: 'sect', title: '青霞谷长老', role: 'cultivator', robe: '#a88a4a', age: 300 },
  { id: 'hongfu', name: '红绡', sex: 'f', home: 'huangfeng', realm: 3, stage: 0, pers: 'arrogant', faction: 'sect', title: '青霞谷长老', role: 'female', robe: '#a0303a', age: 240 },
  { id: 'zhongweiniang', name: '柳卫娘', sex: 'f', home: 'huangfeng', realm: 2, stage: 0, pers: 'kind', faction: 'sect', title: '青霞谷弟子', role: 'female', robe: '#c9a24a', age: 40 },
  { id: 'wangchan', name: '何蝉', sex: 'm', home: 'guiling', realm: 2, stage: 2, pers: 'ruthless', faction: 'demon', title: '阴灵门少主', role: 'cultivator', robe: '#22222c', age: 45 },
  { id: 'yanruyan', name: '沈如嫣', sex: 'f', home: 'yanling', realm: 2, stage: 0, pers: 'cautious', faction: 'sect', title: '鸿家女修', role: 'female', robe: '#5a7aa8', age: 30 },
  { id: 'xiangzhili', name: '骆之礼', sex: 'm', home: 'luoyun', realm: 4, stage: 1, pers: 'aloof', faction: 'rogue', title: '散修元婴', role: 'elder', robe: '#6a6a60', age: 800 },
  { id: 'jiyin', name: '玄阴老祖', sex: 'm', home: 'jiyin', realm: 4, stage: 1, pers: 'ruthless', faction: 'demon', title: '玄阴岛岛主', role: 'elder', robe: '#1a1a24', stay: true, age: 900 },
  { id: 'xuangu', name: '枯骨上人', sex: 'm', home: 'jiyin', realm: 3, stage: 2, pers: 'ruthless', faction: 'demon', title: '附身魔头', role: 'cultivator', robe: '#3a2a2a', age: 1200 },
  { id: 'manhuzi', name: '赤胡子', sex: 'm', home: 'kuixing', realm: 4, stage: 0, pers: 'arrogant', faction: 'rogue', title: '散修老怪', role: 'guard', robe: '#6a4a2a', age: 700 },
  { id: 'wentianren', name: '冷天仁', sex: 'm', home: 'tianxing', realm: 3, stage: 2, pers: 'arrogant', faction: 'demon', title: '九幽极圣之子', role: 'cultivator', robe: '#4a1a2a', age: 320 },
  { id: 'qianlaomo', name: '坤老魔', sex: 'm', home: 'xiaohuan', realm: 4, stage: 1, pers: 'ruthless', faction: 'demon', title: '魔道元婴', role: 'elder', robe: '#2a2030', age: 1000 },
  { id: 'tianlan_saint', name: '天穹圣女', sex: 'f', home: 'tianlan', realm: 3, stage: 0, pers: 'cautious', faction: 'sect', title: '天穹圣殿', role: 'female', robe: '#e8dcb0', stay: true, age: 200 },
  { id: 'mulan_shi', name: '朔漠神师', sex: 'm', home: 'mulan', realm: 3, stage: 1, pers: 'arrogant', faction: 'sect', title: '朔漠法士', role: 'monk', robe: '#8a4a2a', age: 350 },
  { id: 'caomengrong', name: '曹惜容', sex: 'f', home: 'caojia', realm: 0, stage: 0, pers: 'kind', faction: 'mortal', title: '朔州曹家', role: 'female', robe: '#c8a0a0', stay: true, age: 16 },
  { id: 'wuchou', name: '吴丙', sex: 'm', home: 'qingniu', realm: 0, stage: 0, pers: 'kind', faction: 'mortal', title: '白石镇', role: 'farmer', age: 50 },
  // 第二十九步：原著人物各归其地
  { id: 'nanlonghou', name: '西陵侯', sex: 'm', home: 'zhuimo', realm: 4, stage: 0, pers: 'cautious', faction: 'rogue', title: '南荒元婴修士', role: 'elder', robe: '#5a4a3a', stay: true, age: 700 },
  { id: 'baiyaoyi', name: '白璃怡', sex: 'f', home: 'kunwu', realm: 4, stage: 0, pers: 'cautious', faction: 'rogue', title: '封魔山探宝的元婴女修', role: 'female', robe: '#e8e4dc', stay: true, age: 420 },
  // 第二十九步：原创人物（非原著）
  { id: 'o_mengtieyi', name: '石铁衣', sex: 'm', home: 'jiayuan', realm: 1, stage: 7, pers: 'righteous', faction: 'rogue', title: '嘉禾城散修', role: 'guard', robe: '#5a5a4a', age: 24, orig: true },
  { id: 'o_mengtieshan', name: '孟铁山', sex: 'm', home: 'tainan', realm: 1, stage: 11, pers: 'ruthless', faction: 'rogue', title: '南屏山劫修', role: 'guard', robe: '#3a3028', age: 31, orig: true },
  { id: 'o_luqingya', name: '陆青崖', sex: 'm', home: 'huangfeng', realm: 1, stage: 6, pers: 'arrogant', faction: 'sect', title: '青霞谷弟子', role: 'cultivator', robe: '#b8923a', age: 19, orig: true },
  { id: 'o_huiming', name: '慧明', sex: 'm', home: 'yuejing', realm: 2, stage: 3, pers: 'kind', faction: 'rogue', title: '游方僧', role: 'monk', robe: '#a8763a', age: 66, orig: true },
  { id: 'o_gusonghe', name: '顾松鹤', sex: 'm', home: 'luoyun', realm: 3, stage: 4, pers: 'aloof', faction: 'rogue', title: '隐居散修', role: 'elder', robe: '#6a7a6a', stay: true, age: 410, orig: true },
  { id: 'o_zhaowuji', name: '赵无忌', sex: 'm', home: 'huangfeng', realm: 1, stage: 9, pers: 'arrogant', faction: 'sect', title: '红绡门下', role: 'cultivator', robe: '#a83a3a', age: 22, orig: true },
  { id: 'o_leijiu', name: '雷九', sex: 'm', home: 'jiayuan', realm: 1, stage: 8, pers: 'greedy', faction: 'merchant', title: '黑市掮客', role: 'merchant', robe: '#4a3a2a', stay: true, age: 45, orig: true },
  { id: 'o_liusanniang', name: '柳三娘', sex: 'f', home: 'yuejing', realm: 2, stage: 1, pers: 'cautious', faction: 'rogue', title: '梁京茶楼老板娘', role: 'female', robe: '#8a3a4a', stay: true, age: 38, orig: true },
  { id: 'o_baixiao', name: '白枭', sex: 'm', home: 'yuanwu', realm: 2, stage: 1, pers: 'ruthless', faction: 'rogue', title: '赏金客', role: 'guard', robe: '#2a2a30', age: 35, orig: true },
  { id: 'o_ayu', name: '阿妤', sex: 'f', home: 'qingniu', realm: 0, stage: 0, pers: 'kind', faction: 'mortal', title: '白石镇', role: 'female', robe: '#c87a7a', stay: true, age: 11, orig: true, favor: 20 },
  // 第三十五步：各宗原著人物入世（宗门有人，杀一人则举宗皆仇）
  { id: 'zhonglingdao', name: '钟鼎道', sex: 'm', home: 'huangfeng', realm: 3, stage: 2, pers: 'cautious', faction: 'sect', title: '青霞谷掌门', role: 'elder', robe: '#c9a24a', stay: true, age: 330 },
  { id: 'mashibo', name: '冯师伯', sex: 'm', home: 'huangfeng', realm: 2, stage: 2, pers: 'arrogant', faction: 'sect', title: '青霞谷百药园主事', role: 'elder', robe: '#9a8a4a', age: 150 },
  { id: 'nichang', name: '羽裳仙子', sex: 'f', home: 'yanyue', realm: 3, stage: 2, pers: 'cautious', faction: 'sect', title: '凝霜宗掌门', role: 'female', robe: '#ece6f2', stay: true, age: 300 },
  { id: 'qionglaoguai', name: '苍老怪', sex: 'm', home: 'yanyue', realm: 3, stage: 2, pers: 'aloof', faction: 'sect', title: '凝霜宗结丹长老', role: 'elder', robe: '#c8c0d0', age: 420 },
  { id: 'duobaonv', name: '多宝女', sex: 'f', home: 'yanyue', realm: 2, stage: 0, pers: 'greedy', faction: 'sect', title: '凝霜宗弟子', role: 'female', robe: '#e0d6ea', age: 32 },
  { id: 'fuyunzi', name: '浮云子', sex: 'm', home: 'qingxu', realm: 3, stage: 0, pers: 'righteous', faction: 'sect', title: '清微门结丹长老', role: 'cultivator', robe: '#7a9ab0', age: 260 },
  { id: 'hantianya', name: '寒天涯', sex: 'm', home: 'huadao', realm: 3, stage: 0, pers: 'ruthless', faction: 'sect', title: '断刀坞结丹长老', role: 'cultivator', robe: '#6a5a72', age: 240 },
  { id: 'liyingning', name: '李若宁', sex: 'f', home: 'huadao', realm: 1, stage: 10, pers: 'righteous', faction: 'sect', title: '断刀坞弟子', role: 'female', robe: '#5a5a62', age: 19 },
  { id: 'fengyue', name: '封岩', sex: 'm', home: 'tianque', realm: 2, stage: 0, pers: 'arrogant', faction: 'sect', title: '天枢堡弟子', role: 'cultivator', robe: '#8a6a4a', age: 60 },
  { id: 'mayunlong', name: '马腾云', sex: 'm', home: 'tianque', realm: 2, stage: 1, pers: 'righteous', faction: 'sect', title: '天枢堡执事', role: 'guard', robe: '#7a5a3a', age: 90 },
  { id: 'wuchi', name: '武痴', sex: 'm', home: 'jujian', realm: 3, stage: 1, pers: 'righteous', faction: 'sect', title: '重岳剑门结丹长老', role: 'guard', robe: '#4a5a6a', age: 280 },
  { id: 'zhongwu', name: '钟吾', sex: 'm', home: 'lingshou', realm: 2, stage: 1, pers: 'ruthless', faction: 'sect', title: '驭兽山弟子', role: 'guard', robe: '#6a7a4a', age: 70 },
  { id: 'lvtianmeng', name: '吕天策', sex: 'm', home: 'lingshou', realm: 2, stage: 0, pers: 'arrogant', faction: 'sect', title: '驭兽山弟子', role: 'cultivator', robe: '#7a8a5a', age: 45 },
  { id: 'hanyunzhi', name: '谢云芝', sex: 'f', home: 'lingshou', realm: 2, stage: 0, pers: 'cautious', faction: 'sect', title: '驭兽山女修', role: 'female', robe: '#5a8a4a', age: 36 },
  { id: 'yanlaozu', name: '鸿家老祖', sex: 'm', home: 'yanling', realm: 3, stage: 2, pers: 'cautious', faction: 'sect', title: '鸿家老祖', role: 'elder', robe: '#3a4a6a', stay: true, age: 480 },
  { id: 'wangtiangu', name: '汪天古', sex: 'm', home: 'guiling', realm: 4, stage: 0, pers: 'ruthless', faction: 'demon', title: '阴灵门门主', role: 'elder', robe: '#1e1e28', stay: true, age: 700 },
  { id: 'wangtiansheng', name: '汪天胜', sex: 'm', home: 'guiling', realm: 3, stage: 1, pers: 'ruthless', faction: 'demon', title: '阴灵门长老', role: 'cultivator', robe: '#2a2a34', age: 380 },
  { id: 'suihun', name: '碎魂真人', sex: 'm', home: 'guiling', realm: 3, stage: 0, pers: 'ruthless', faction: 'demon', title: '阴灵门结丹修士', role: 'cultivator', robe: '#30303a', age: 300 },
  { id: 'guilao', name: '鬼老', sex: 'm', home: 'guiling', realm: 3, stage: 1, pers: 'aloof', faction: 'demon', title: '何蝉护卫', role: 'guard', robe: '#18181e', age: 500 },
  { id: 'tonglao', name: '童老', sex: 'm', home: 'guiling', realm: 3, stage: 1, pers: 'ruthless', faction: 'demon', title: '何蝉护卫', role: 'guard', robe: '#24242c', age: 480 },
  { id: 'hehuanlaomo', name: '天欢老魔', sex: 'm', home: 'hehuan', realm: 4, stage: 2, pers: 'arrogant', faction: 'demon', title: '天欢宗宗主', role: 'elder', robe: '#6a2a4a', stay: true, age: 900 },
  { id: 'yunlu', name: '霜露老魔', sex: 'm', home: 'hehuan', realm: 4, stage: 1, pers: 'aloof', faction: 'demon', title: '天欢宗元婴长老', role: 'elder', robe: '#5a4a5a', age: 750 },
  { id: 'dongmentu', name: '南门图', sex: 'm', home: 'yuling', realm: 4, stage: 0, pers: 'cautious', faction: 'demon', title: '役灵宗大长老', role: 'elder', robe: '#3a4a3a', stay: true, age: 800 },
  { id: 'tianshazhenjun', name: '玄煞真君', sex: 'm', home: 'tiansha', realm: 4, stage: 0, pers: 'ruthless', faction: 'demon', title: '玄煞宗宗主', role: 'elder', robe: '#3a1414', stay: true, age: 760 },
  { id: 'weizhanglao', name: '卫长老', sex: 'm', home: 'tiansha', realm: 3, stage: 0, pers: 'greedy', faction: 'demon', title: '玄煞宗结丹长老', role: 'cultivator', robe: '#3a1a1a', age: 290 },
  { id: 'luzhanglao', name: '鲁长老', sex: 'm', home: 'qianhuan', realm: 3, stage: 1, pers: 'cautious', faction: 'demon', title: '万幻宗结丹长老', role: 'cultivator', robe: '#7a4a8a', age: 330 },
  { id: 'chengtiankun', name: '程天乾', sex: 'm', home: 'luoyun', realm: 4, stage: 0, pers: 'righteous', faction: 'sect', title: '栖云宗大长老', role: 'elder', robe: '#e8e4dc', stay: true, age: 850 },
  { id: 'lvluo', name: '吕湘', sex: 'm', home: 'luoyun', realm: 3, stage: 0, pers: 'cautious', faction: 'sect', title: '栖云宗结丹长老', role: 'cultivator', robe: '#4f8a8a', age: 280 },
  { id: 'jiangyun', name: '姜云', sex: 'm', home: 'gujian', realm: 3, stage: 0, pers: 'aloof', faction: 'sect', title: '藏剑门结丹剑修', role: 'cultivator', robe: '#6a8aa0', age: 210 },
  { id: 'changzheng', name: '昌正', sex: 'm', home: 'baiqiao', realm: 3, stage: 0, pers: 'kind', faction: 'sect', title: '天工院傀儡师', role: 'scholar', robe: '#8a7a5a', stay: true, age: 320 },
  { id: 'wanxiaoshan', name: '万小川', sex: 'm', home: 'jiayuan', realm: 1, stage: 9, pers: 'greedy', faction: 'rogue', title: '嘉禾城散修', role: 'merchant', robe: '#6a5a4a', age: 26 },
  { id: 'qiyunxiao', name: '齐云峰', sex: 'm', home: 'yuejing', realm: 2, stage: 1, pers: 'aloof', faction: 'rogue', title: '白衣散修', role: 'scholar', robe: '#e8e8e0', age: 70 },
  { id: 'xinruyin', name: '辛如韵', sex: 'f', home: 'tainan', realm: 3, stage: 0, pers: 'cautious', faction: 'rogue', title: '阵法大家', role: 'female', robe: '#d8d4cc', stay: true, age: 180 },
  { id: 'jinguang', name: '金阙上人', sex: 'm', home: 'tainan', realm: 2, stage: 0, pers: 'ruthless', faction: 'rogue', title: '南屏山劫修', role: 'guard', robe: '#b8902a', age: 90 },
  { id: 'ouyang', name: '欧阳凌霄', sex: 'm', home: 'cheqi', realm: 3, stage: 0, pers: 'ruthless', faction: 'rogue', title: '劫修', role: 'cultivator', robe: '#1e1e22', age: 200 },
  { id: 'liudao', name: '九幽极圣', sex: 'm', home: 'tianxing', realm: 4, stage: 2, pers: 'ruthless', faction: 'demon', title: '沧溟海第一魔头', role: 'elder', robe: '#2a1a34', stay: true, age: 1300 },
  { id: 'qingyi', name: '青衍居士', sex: 'm', home: 'biling', realm: 4, stage: 0, pers: 'kind', faction: 'rogue', title: '散修元婴', role: 'elder', robe: '#4a7a6a', stay: true, age: 900 },
  { id: 'zhuoruting', name: '卓如婉', sex: 'f', home: 'miaoyin', realm: 2, stage: 0, pers: 'kind', faction: 'sect', title: '清音门女修', role: 'female', robe: '#e8c8d0', age: 24 },
  { id: 'miaohe', name: '妙鹤真人', sex: 'm', home: 'leikong', realm: 3, stage: 0, pers: 'ruthless', faction: 'rogue', title: '沧溟海结丹散修', role: 'cultivator', robe: '#e0e0e0', age: 330 },
  { id: 'fangzongzhu', name: '房宗主', sex: 'm', home: 'yinluo', realm: 4, stage: 0, pers: 'cautious', faction: 'demon', title: '幽罗宗宗主', role: 'elder', robe: '#3a2a4a', stay: true, age: 820 },
  { id: 'tianku', name: '天哭老人', sex: 'm', home: 'yinluo', realm: 3, stage: 2, pers: 'ruthless', faction: 'demon', title: '幽罗宗长老', role: 'elder', robe: '#2a3a2a', age: 600 },
  { id: 'lufuren', name: '陆夫人', sex: 'f', home: 'yinluo', realm: 3, stage: 1, pers: 'ruthless', faction: 'demon', title: '幽罗宗女修', role: 'female', robe: '#1a1a1e', age: 220 },
  { id: 'xuanqingzi', name: '玄青子', sex: 'm', home: 'taiyi', realm: 4, stage: 1, pers: 'righteous', faction: 'sect', title: '太一门元婴长老', role: 'elder', robe: '#3a5a9a', stay: true, age: 1100 },
  { id: 'qimiao', name: '七妙真人', sex: 'm', home: 'tianmo', realm: 4, stage: 0, pers: 'ruthless', faction: 'demon', title: '天魔宗元婴长老', role: 'elder', robe: '#5a1418', stay: true, age: 950 },
  { id: 'chelaoyao', name: '柴老妖', sex: 'm', home: 'xi_mo', realm: 4, stage: 0, pers: 'greedy', faction: 'rogue', title: '万妖谷谷主', role: 'elder', robe: '#5a4a2a', stay: true, age: 1000 },
];

// 原著人物台词（自由发展，只取其性格）
const CANON_LINES: Record<string, string[]> = {
  zhonglingdao: ['（钟鼎道含笑拱手）谷中弟子众多，能入我眼的却不多。你算一个。', '七派同气连枝，魔门六宗虎视眈眈——你我都得早作打算。'],
  mashibo: ['哼，百药园的灵草少了一株，老夫都知道是谁动的手。', '想在药园做事？先把这些杂草拔干净再说。'],
  nichang: ['（羽裳仙子微微一笑，神色端庄）道友不必拘礼。', '凝霜宗的弟子，若有人欺负，本宫自会讨个公道。'],
  qionglaoguai: ['嘿嘿嘿，小家伙，身上有好东西吧？老夫闻得出来。', '老夫活了这么多年，最不缺的就是耐心。'],
  duobaonv: ['看看看！这是我新得的玉佩，好看吧？', '你要是有稀罕物件，拿来与我换呀，多少灵石都行。'],
  fuyunzi: ['（浮云子稽首）无量天尊。道友来清微门，可是为了论道？', '修道修心，剑再利，也斩不断心魔。'],
  hantianya: ['（寒天涯以袖掩口，轻声一笑）这位道友，生得倒是周正。', '断刀坞的刀，杀人从不见血。'],
  liyingning: ['喂！你也是来历练的？要不要比划比划？', '我爹说我毛躁，可我觉得出刀就要快！'],
  fengyue: ['哈哈，痛快！来，陪我喝一口！', '天枢堡的人，从不怕事。'],
  mayunlong: ['（马腾云抱枪而立）道友请回，前方是天枢堡禁地。', '守住山门，便是我的道。'],
  wuchi: ['剑！你的剑呢？拿出来让我看看！', '我只想找个人痛痛快快打一场。'],
  zhongwu: ['看什么看？没见过驭兽山的人？', '我这小东西饿了，你身上有没有灵兽丹？'],
  lvtianmeng: ['（吕天策轻摇折扇）在下驭兽山吕天策，阁下是？', '区区筑基，也配与我说话？'],
  hanyunzhi: ['（谢云芝托着一只金色小甲虫）它好像挺喜欢你的。', '师门让我留意外人……你放心，我不会多嘴。'],
  yanlaozu: ['（鸿家老祖拄着龙头拐，眯眼打量你）鸿家的事，外人少插手。', '老夫这把年纪，最看重的就是家族香火。'],
  wangtiangu: ['（汪天古垂目不语，魂幡上绿光幽幽）……', '阴灵门的事，你最好别打听。'],
  wangtiansheng: ['滚开！别挡老子的路！', '谁敢动我侄儿何蝉，我把他魂魄炼进幡里！'],
  suihun: ['（碎魂真人干笑两声）好鲜活的魂魄……', '莫怕，老夫只取一缕神魂，不伤性命。'],
  guilao: ['（鬼老兜帽下一双绿眼，一言不发）', '……少主有令，闲人勿近。'],
  tonglao: ['嘻嘻，小哥哥陪我玩呀？（声音却苍老沙哑）', '拨浪鼓一响，魂就跟我走咯。'],
  hehuanlaomo: ['（天欢老魔摇着桃花扇，眼角含笑）道友，人生苦短，何必那么较真？', '天欢宗的门，从来只进不出。'],
  yunlu: ['（霜露老魔拨着念珠）……你认得红绡？她……还好吗？', '魔道也罢，正道也罢，我只认一个人。'],
  dongmentu: ['（南门图袖口爬出一只小虫）别动，它认生。', '役灵宗驭的是灵兽，也驭人心。'],
  tianshazhenjun: ['（玄煞真君周身煞气翻涌）挡我者死。', '玄煞宗不讲道理，只讲刀。'],
  weizhanglao: ['（卫长老笑眯眯的）道友莫怕，老夫最是和气。', '做生意嘛，总得有来有往。'],
  luzhanglao: ['（半边银面具下，看不清他的神情）你看到的，未必是真的。', '万幻宗，千般幻象，一线真心。'],
  chengtiankun: ['（程天乾抚须）正一盟诸派，当守望相助。', '年轻人，凡事留一线。'],
  lvluo: ['这阵盘若是摆错一格，便是生门变死门。', '小友若有难处，不妨与吕某商量。'],
  jiangyun: ['（姜云抱剑倚树，眼也不睁）……有事？', '剑在，人就在。'],
  changzheng: ['你瞧这傀儡！关节是三重机括，比真人还灵活！', '哎呀，又说多了。天工院的人，就是管不住嘴。'],
  wanxiaoshan: ['哟，道友！新到的符箓，便宜卖，要不要？', '消息？那得看你出多少灵石了，嘿嘿。'],
  qiyunxiao: ['（齐云峰横箫一笑）相逢即是有缘，可要听一曲？', '这江湖，处处是风景。'],
  xinruyin: ['（辛如韵掩口轻咳）咳……道友对阵法也有兴趣？', '我这身子骨不中用，只好在阵法上多下些功夫。'],
  jinguang: ['识相的，把储物袋留下！', '金光砖下，不留活口。'],
  ouyang: ['（欧阳凌霄黑披风猎猎作响）你的命，值几块灵石？', '劫修？不，我只是拿回该拿的东西。'],
  liudao: ['（一股恐怖的威压笼罩四周）……蝼蚁。', '星罗殿？哼，迟早是本圣的囊中之物。'],
  qingyi: ['（青衍居士展开画轴）此画中藏着一方天地，道友可想进去瞧瞧？', '老夫早已不问世事，只愿逍遥。'],
  zhuoruting: ['（卓如婉照着小铜镜）嘻，你也来清音门听琴？', '师姐说外面的男修都很坏……你看起来不像呀。'],
  miaohe: ['（妙鹤真人眯起眼）道友也是来寻宝的？不如同行，彼此照应。', '沧溟海里，最不值钱的就是信任。'],
  fangzongzhu: ['（房宗主手持黑色令旗）幽罗宗与你无冤无仇，道友好自为之。', '魔道之中，谨慎的人才活得长。'],
  tianku: ['（天哭老人脸上两道血泪痕）呜……又一个要死的人。', '哭丧棒响，阎王开门。'],
  lufuren: ['（陆夫人冷冷瞥你一眼）滚。', '我夫君的仇，我会一个一个去讨。'],
  xuanqingzi: ['（玄青子拂尘一摆）中州正道，以太一门为首。道友行事，当守规矩。', '魔道猖獗，正道当同心。'],
  qimiao: ['（七颗小珠绕着七妙真人缓缓旋转）你身上有股很特别的气息。', '天魔宗想要的东西，从来没有得不到的。'],
  chelaoyao: ['（柴老妖竖瞳一缩）人族小子，你身上有妖兽的味道。', '万妖谷的妖，可比人讲信用。'],
  modaifu: ['（邹大夫捻须打量你）根骨……嗯，倒也不算太差。最近练功可有异样？', '老夫这里有几味好药，对你修炼大有裨益。何时来回春谷，老夫替你看看？', '少年人，修仙之路凶险，凡事要多留个心眼。'],
  lifeiyu: ['苏兄弟！许久不见，你这身气度……莫不是有了奇遇？', '我这辈子只想多活几年，护着身边的人。你若有难处，尽管开口。', '江湖上的事我还应付得来，仙家的事，我就帮不上了。'],
  lihuayuan: ['（严化尘负手而立）修仙一途，靠的是心性。你若肯吃苦，我门下也不缺你一个位置。', '青霞谷七派同气连枝，魔道近来蠢蠢欲动，你也当早做准备。', '你身上灵气虽杂，却凝而不散，倒是有几分门道。'],
  linghu: ['（老者眼皮也未抬）……嗯。', '元婴之路，非大毅力大机缘不可成。年轻人，去吧。'],
  leiwanhe: ['小辈，丹道一途，火候最难。', '赤霄禁地每隔几年开启一次，那里的灵药是筑基丹主材，你可有胆量一去？'],
  hongfu: ['哼，又一个想走捷径的？', '本座的弟子，可不是谁都能招惹的。'],
  zhongweiniang: ['师兄好。谷中最近新来的弟子可多了。', '听说坊市新到了一批符箓，便宜得很。'],
  wangchan: ['（何蝉阴恻恻一笑）好浓的灵气……道友身上有好东西啊。', '阴灵门办事，闲人退避。', '鸿家的女人，迟早是我的。'],
  yanruyan: ['（沈如嫣微微颔首，神色淡淡）道友有礼。', '鸿家堡近来不太平，道友若无事，还是早些离开吧。'],
  xiangzhili: ['哈哈，有趣有趣，又遇上一个小家伙。', '南荒这地方，元婴老怪也不过是井底之蛙罢了。老夫打算去中州看看。'],
  jiyin: ['（阴冷的神识扫过你周身）结丹都不到，也敢在玄阴岛乱逛？', '本祖师心情好，滚吧。'],
  xuangu: ['（这具身体里似乎住着另一个灵魂）……道友，你我做个交易如何？'],
  manhuzi: ['哈哈哈！老夫平生最爱好酒和一场好架！', '小子，看你顺眼，这块灵石赏你了。'],
  wentianren: ['（冷天仁眼神轻蔑）九幽极圣之名，你可听过？', '归墟殿中的宝物，我冷天仁要定了。'],
  qianlaomo: ['……滚。'],
  tianlan_saint: ['草原上的修行之道，与南荒大不相同。', '外乡修士，请守圣殿的规矩。'],
  caomengrong: ['（少女好奇地打量你）你是从南边草原来的吗？听说那边常有仙师斗法。', '舜江的水一年四季都冷得刺骨，去年还漂下来一块好大的冰呢。', '爹爹说修仙的人都很凶，可你看起来不像。'],
  mulan_shi: ['南荒的修士，又来草原做什么？', '我朔漠法士，从不惧南荒七派。'],
  wuchou: ['小立子回来啦？你爹娘可想你了。', '今年收成不错，就是山里的狼又多了。'],
  nanlonghou: ['（西陵侯神色凝重）陨魔谷的迷雾又浓了几分……里面的东西，不是你我能碰的。', '小友修为不高，胆子倒不小。谷中空间裂缝随时会变，切莫贪功冒进。', '老夫在此守了许多年，为的是谷中一样东西。至于是什么……你不必知道。'],
  baiyaoyi: ['（白衣女修淡淡瞥了你一眼）封魔山的禁制未破，你来得早了。', '昆吾殿下镇着的东西，传说是上古魔物。道友若无把握，还是莫要靠近。', '尸狼、银翼夜叉……这山里的东西，越往深处越凶。'],
  o_baixiao: ['……', '没人出钱的时候，我对你没兴趣。'],
  o_mengtieshan: ['（刀疤汉子横刀拦路）此山是我开——算了，你走吧。', '看什么看？'],
};

const GREET: Record<Pers, string[]> = {
  righteous: ['道友请了。近来山中多有妖兽出没，还请小心。', '在下行走四方，只求问心无愧。道友可是同道中人？', '路见不平，自当拔刀。道友若遇魔修作恶，可唤我一声。'],
  greedy: ['（对方目光在你储物袋上停了片刻）道友……从何处来啊？', '嘿嘿，灵石这东西，谁会嫌多呢？', '道友若有闲置的宝物，在下愿出高价——当然，也不是太高。'],
  cautious: ['（对方暗自运转护体灵光，与你保持着距离）道友有何贵干？', '萍水相逢，还请道友见谅，在下不便多言。', '这一带不太平，在下劝道友早些赶路。'],
  arrogant: ['哼，区区{realm}，也配与我说话？', '让开，莫要挡路。', '本座的时间宝贵得很，有话快说。'],
  kind: ['道友面善得很，可是初到此地？', '出门在外，互相照应总是好的。', '若是缺些疗伤丹药，我这里倒还有几颗。'],
  ruthless: ['（一股冰冷的杀意一闪而逝）……有事？', '修仙界弱肉强食，道友可要好好活着。', '你最好别多管闲事。'],
  aloof: ['（对方睁眼看了你一眼，又阖上了）', '大道无情，你我不过是匆匆过客。', '修行在己，何须多言。'],
};
const MORTAL_GREET = ['仙、仙师！小人有礼了。', '这位公子，要不要买点干粮？', '听说山那边又有仙人斗法，好吓人哩。', '今年的雨水足，庄稼长得好。', '仙师可是要往城里去？沿着大路一直走就是。'];

export class NpcWorld {
  game: Game;
  list: NpcData[] = [];
  byId = new Map<string, NpcData>();
  active = new Map<string, Active>();
  private simT = 0; private lastDay = -1; private noticeT = 0; private duelT = 4; private watchT = 2; private paradeT = 90;
  private lastRefreshX = NaN; private lastRefreshY = NaN;
  /** 这一轮允许显示名牌的人（最近若干）；其余不画，避免满屏都是字 */
  private labelSet = new Set<string>();
  private labelT = 0;
  private labelCand: { id: string; d: number }[] = [];
  private frameTick = 0;
  /** 全场景「新起一个气泡」的节流：刚踏进宗门时几十个人同时开口会糊成一片 */
  private speakT = 0;
  /** 气泡绘制节流（同一帧最多画几个 + 位置太近只画一个） */
  private bubFrame = -1;
  private bubDrawn: { x: number; y: number }[] = [];
  maySpeak() { if (this.speakT > 0) return false; this.speakT = 0.45; return true; }  focus: Active | null = null;   // 最近可交谈者

  constructor(game: Game) { this.game = game; }
  /** 第二十二步 + v0.73：在某地的街巷 / 广场上找个落脚点（贴图布局的城镇宗门）；否则按干地校验采样，海边地点绝不刷进水里 */
  homeAt(l: LocDef, rnd: () => number, sx: number, sy: number, dy = 0) {
    const s = l.map === ACTIVE_MAP ? this.game.space?.spot(l, rnd) : null;
    if (s) return s;
    const cx = l.x * WORLD_SCALE, cy = l.y * WORLD_SCALE;
    const T = l.map === ACTIVE_MAP ? this.game.terrain : null;
    const S = l.map === ACTIVE_MAP ? this.game.space : null;
    if (T && typeof T.isLand === 'function' && typeof T.walkFactor === 'function') {
      for (let i = 0; i < 16; i++) {
        const x = cx + (rnd() - 0.5) * sx, y = cy + (rnd() - 0.5) * sy + dy;
        if (T.isLand(x, y) && T.walkFactor(x, y) > 0 && !S?.blocked(x, y)) return { x, y };
      }
      // 沿海/岛屿兜底：螺旋搜寻最近可行走陆地
      for (let r = 80; r <= 1200; r += 100) {
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * TAU, x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.75;
          if (T.isLand(x, y) && T.walkFactor(x, y) > 0 && !S?.blocked(x, y)) return { x, y };
        }
      }
    }
    return { x: cx + (rnd() - 0.5) * sx, y: cy + (rnd() - 0.5) * sy + dy };
  }

  // ------------------------------------------------------------ 生成
  newWorld(seed = 20241015) {
    this.lastDay = Math.floor(this.game.day);
    const rnd = mulberry32(seed);
    this.list = []; this.active.clear();
    const at = (loc: LocDef, spread = 600) => this.homeAt(loc, rnd, spread * 2, spread * 1.4);
    for (const c of CANON) {
      const loc = LOC_BY_ID.get(c.home); if (!loc) continue;   // 三张图的原著人物都在册，各居其地
      const p = at(loc, 420);
      this.list.push({ id: c.id, name: c.name, sex: c.sex, role: c.role, realm: c.realm, stage: c.stage, faction: c.faction, sect: c.faction === 'sect' || c.faction === 'demon' ? c.home : undefined, home: c.home, pers: c.pers, favor: c.favor ?? (c.id === 'lifeiyu' || c.id === 'wuchou' ? 40 : 0), grudge: 0, met: false, alive: true, age: c.age, life: REALMS[c.realm].life * 1.1, x: p.x, y: p.y, tx: p.x, ty: p.y, goal: 'stay', until: 0, wealth: 30 + c.realm * c.realm * 400, seed: Math.floor(rnd() * 1e9), canon: true, title: c.title, robe: c.robe, stay: c.stay, orig: c.orig });
    }
    for (const b of BEAUTIES) {
      const loc = LOC_BY_ID.get(b.home); if (!loc) continue;
      const p = at(loc, 360);
      this.list.push({ id: 'b_' + b.id, name: b.name, sex: 'f', role: 'female', realm: b.realm, stage: b.stage, faction: b.faction, sect: b.faction === 'sect' ? b.home : undefined, home: b.home, pers: b.pers, favor: 0, grudge: 0, met: false, alive: true, age: b.age, life: REALMS[Math.max(1, b.realm)].life * 1.2, x: p.x, y: p.y, tx: p.x, ty: p.y, goal: 'stay', until: 0, wealth: 200 + b.realm * 800, seed: Math.floor(rnd() * 1e9), canon: true, title: b.title, beauty: b.id, stay: true });
    }
    for (const d of this.list) {
      d.map = LOC_BY_ID.get(d.home)?.map ?? 'renjie';
      d.root ??= pickNpcRoot(d.realm, d.seed);
    }
    // 普通修士与凡人（人界三域各自一批；沿用旧编号与人口比例）
    const rLocs = locsOf('renjie').filter((l) => l.type !== 'danger' && l.type !== 'secret');
    const batches: [string, number, LocDef[]][] = [
      ['n', 380, rLocs.filter((l) => l.oy >= 262 && !(l.ox >= 630 && l.oy >= 290))],
      ['xn', 200, rLocs.filter((l) => l.ox >= 630 && l.oy >= 290)],
      ['jn', 500, rLocs.filter((l) => l.oy < 262)],
    ];
    for (const [pre, count, homes] of batches) {
      if (!homes.length) continue;
      // 按地点规模加权：城池、宗门人多，荒野小地点人少
      const wt = (l: LocDef) => (l.type === 'city' ? 8 : l.type === 'sect' ? 6 : l.type === 'town' ? 3 : l.type === 'isle' ? 2.5 : 1) * (l.minor ? 0.35 : 1);
      const cum: number[] = []; let tot = 0; for (const l of homes) cum.push(tot += wt(l));
      const pickHome = () => { const r = rnd() * tot; let lo = 0, hi = cum.length - 1; while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < r) lo = mid + 1; else hi = mid; } return homes[lo]; };
      for (let i = 0; i < count; i++) this.list.push(this.spawnRandom(rnd, pickHome(), pre + i));
    }
    if (ACTIVE_WORLD !== 'human') this.ensureWorldNpcs(ACTIVE_WORLD, seed + 17);
    this.reindex();
    this.game.rel?.genTies(this.list, rnd, true);
  }
  /** 灵界/仙界懒生成本界常住修士（避免新开人界档即塞入三界千余 NPC） */
  ensureWorldNpcs(worldId: WorldId, seed = 20261116) {
    if (worldId === 'human') return;
    if (this.list.some((n) => n.alive && worldOfMap(npcMap(n)) === worldId)) return;
    const rnd = mulberry32(seed + worldId.length * 997);
    for (const m of WORLDS[worldId].maps as MapId[]) {
      const homes = locsOf(m).filter((l) => l.type !== 'danger' && l.type !== 'secret');
      if (!homes.length) continue;
      const wt = (l: LocDef) => (l.type === 'city' ? 8 : l.type === 'sect' ? 6 : l.type === 'town' ? 3 : l.type === 'isle' ? 2.5 : 1) * (l.minor ? 0.35 : 1);
      const cum: number[] = []; let tot = 0; for (const l of homes) cum.push(tot += wt(l));
      const pickHome = () => { const r = rnd() * tot; let lo = 0, hi = cum.length - 1; while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < r) lo = mid + 1; else hi = mid; } return homes[lo]; };
      const cnt = POP[m] ?? 60;
      for (let i = 0; i < cnt; i++) {
        const npc = this.spawnRandom(rnd, pickHome(), `${m}_${i}`);
        npc.originWorld = worldId;
        npc.transient = true;
        this.list.push(npc);
      }
    }
    this.reindex();
  }
  /** 跨界时封存离去位面的无羁绊路人 NPC，恢复目标位面存档（保留全部健在路人，不丢人界人口） */
  archiveAndSwitchWorldNpcs(fromWorld: WorldId, toWorld: WorldId, ws: import('./worldstate').WorldState) {
    if (fromWorld === toWorld) return;
    const fromSlice = (ws.worlds ??= {})[fromWorld] ?? (ws.worlds[fromWorld] = {});
    const archived: NpcData[] = [];
    const kept: NpcData[] = [];
    for (const n of this.list) {
      const w = worldOfMap(npcMap(n));
      if (w === fromWorld && !n.canon && !n.bond && !n.met && !(n.grudge > 0)) {
        if (n.alive) archived.push(n);
      } else {
        kept.push(n);
      }
    }
    fromSlice.npcArchive = archived;
    this.active.clear();
    this.list = kept;
    const toSlice = ws.worlds[toWorld];
    if (toSlice?.npcArchive?.length) {
      const existingIds = new Set(this.list.map((x) => x.id));
      for (const n of toSlice.npcArchive) if (!existingIds.has(n.id)) this.list.push(n);
      toSlice.npcArchive = [];
    }
    if (toWorld !== 'human') this.ensureWorldNpcs(toWorld);
    this.reindex();
  }
  spawnRandom(rnd: () => number, loc: LocDef, id: string): NpcData {
    const isSect = loc.type === 'sect', demon = DEMON_SECTS.has(loc.id);
    const locWorld = worldOfMap(loc.map);
    let faction: Faction = isSect ? (demon ? 'demon' : 'sect') : loc.type === 'city' ? (rnd() < 0.3 ? 'merchant' : rnd() < 0.6 ? 'rogue' : 'mortal') : loc.type === 'isle' ? (rnd() < 0.7 ? 'rogue' : 'merchant') : (rnd() < 0.7 ? 'mortal' : 'rogue');
    if (locWorld !== 'human' && faction === 'mortal') faction = rnd() < 0.45 ? 'merchant' : 'rogue';
    if (!isSect && rnd() < 0.06) faction = 'demon';
    const sex: 'm' | 'f' = rnd() < (faction === 'mortal' ? 0.4 : 0.32) ? 'f' : 'm';
    const regKey = loc.map === 'renjie' ? (loc.ox >= 630 && loc.oy >= 290 ? 'luanxing' : loc.oy < 262 ? 'dajin' : 'tiannan') : loc.map;
    let realm = 0, stage = 0;
    if (faction !== 'mortal') {
      // 第三十七步：按各域的人口金字塔（炼气满地、筑基不少、结丹寥寥；散修元婴另有名额，不在此生成）
      realm = rogueRealmAt(regKey, rnd);
      stage = Math.floor(Math.pow(rnd(), 1.2) * (REALMS[realm]?.stages.length ?? 1));
    }
    const P: Pers[] = faction === 'demon' ? ['ruthless', 'greedy', 'arrogant', 'cautious'] : faction === 'merchant' ? ['greedy', 'kind', 'cautious'] : faction === 'mortal' ? ['kind', 'cautious', 'righteous'] : ['righteous', 'greedy', 'cautious', 'arrogant', 'kind', 'ruthless', 'aloof'];
    const pers = P[Math.floor(rnd() * P.length)];
    const role: NpcRole = faction === 'mortal' ? (sex === 'f' ? 'female' : (['farmer', 'farmer', 'merchant', 'scholar', 'guard'] as NpcRole[])[Math.floor(rnd() * 5)]) : sex === 'f' ? 'female' : faction === 'merchant' ? 'merchant' : realm >= 3 && rnd() < 0.5 ? 'elder' : rnd() < 0.1 ? 'monk' : 'cultivator';
    const { x, y } = this.homeAt(loc, rnd, 1400, 1000);
    const age = faction === 'mortal' ? 14 + rnd() * 50 : 18 + rnd() * ((REALMS[realm]?.life ?? 120) * 0.6);
    const seed = Math.floor(rnd() * 1e9);
    const baseWealth = locWorld === 'immortal' ? 20 + Math.round(rnd() * 80) : locWorld === 'spirit' ? 30 + Math.round(rnd() * 120) : Math.round((faction === 'mortal' ? 2 : 20) * Math.pow(4, realm) * (0.5 + rnd()) * (faction === 'merchant' ? 3 : 1));
    return {
      id, name: makeName(rnd, sex), sex, role, realm, stage, faction, sect: isSect ? loc.id : undefined, home: loc.id, pers,
      favor: 0, grudge: 0, met: false, alive: true, age, life: faction === 'mortal' ? 60 + rnd() * 25 : (REALMS[realm]?.life ?? 120) * (0.85 + rnd() * 0.3),
      x, y, tx: x, ty: y, goal: 'stay', until: 0, wealth: baseWealth,
      seed, root: pickNpcRoot(realm, seed), robe: isSect ? SECT_ROBE[loc.id] : undefined, map: loc.map,
      ...(locWorld !== 'human' ? { originWorld: locWorld } : {}),
    };
  }
  private reindex() { this.byId = new Map(this.list.map((n) => [n.id, n])); }
  /** v0.70：红颜不再登场（旧存档读入时移除） */
  dropBeauties() {
    if (!this.list.some((n) => n.beauty)) return;
    this.list = this.list.filter((n) => !n.beauty);
    for (const id of [...this.active.keys()]) if (id.startsWith('b_')) this.active.delete(id);
    this.reindex();
  }

  /** 第三十六步：名册门人散去时，从在场名单中抹掉 */
  forget(id: string) { this.active.delete(id); }
  /** 第四十三步：出关时先把闭关这些日子补算完（众生不等你） */
  catchUp() {
    this.game.living?.flushDailySlice();
    const day = Math.floor(this.game.day);
    if (this.lastDay >= 0 && day > this.lastDay) { this.daily(day - this.lastDay); this.lastDay = day; }
  }
  /** 闭关异步分帧追赶：先快速推进生老/补员，再把耗时的 living 演进切成时间片 */
  beginCatchUp(): number {
    this.game.living?.flushDailySlice();
    const day = Math.floor(this.game.day);
    if (this.lastDay < 0 || day <= this.lastDay) return 0;
    const days = day - this.lastDay;
    this.dailyHead(days);
    this.game.living?.beginCatchUp(days);
    return days;
  }
  stepCatchUp(budgetMs = 10): { done: boolean; progress: number } {
    const res = this.game.living?.stepCatchUp(budgetMs) ?? { done: true, progress: 1 };
    if (res.done) {
      this.lastDay = Math.floor(this.game.day);
      if (this.list.length > 960) {
        this.list = this.list.filter((n) => n.alive || n.canon || n.met || !!n.bond || (n.grudge ?? 0) > 0 || n.born !== undefined);
        this.reindex();
      }
    }
    return res;
  }
  toSave() {
    return this.list
      .filter((n) => ((!n.ros && !n.gz) || Roster.notable(n)) && (n.alive || n.canon || n.met || !!n.bond || (n.grudge ?? 0) > 0 || n.born !== undefined))
      .map((n) => ({ ...n, x: Math.round(n.x), y: Math.round(n.y), tx: Math.round(n.tx), ty: Math.round(n.ty), age: +n.age.toFixed(2) }));
  }
  fromSave(a: NpcData[] | undefined, wk = 1) {
    this.active.clear();
    this.lastDay = Math.floor(this.game.day);
    if (!a || !a.length) { this.newWorld(); return; }
    this.list = a.map((n) => ({ ...n, helpUntil: undefined, x: n.x * wk, y: n.y * wk, tx: n.tx * wk, ty: n.ty * wk, root: n.root ?? pickNpcRoot(n.realm, n.seed) }));
    // 第三十七步：旧存档里的“满街元婴、化神后期”按人口金字塔回落（高界来客保留真实境界）
    { const yy: Record<string, number> = {};
      for (const n of this.list) {
        const localW = worldOfMap(n.map ?? 'renjie');
        const originW = n.originWorld ?? localW;
        const capR = worldRealmCap(originW).maxRealm;
        if (originW === 'human' && n.realm >= capR && !n.canon) { n.realm = Math.max(0, capR - 1); n.stage = 2; }
        capRealm(n, originW);
        if (n.realm === 4 && !n.canon && !n.ros && n.faction !== 'sect' && n.faction !== 'demon') {
          const m = n.map ?? 'renjie'; yy[m] = (yy[m] ?? 0) + 1;
          if (yy[m] > (m === 'renjie' ? 6 : 3)) { n.realm = 3; n.stage = Math.min(2, n.stage); }
        }
      } }
    // 新版本加入的原著人物 / 红颜补齐
    const tmp = new NpcWorld(this.game); tmp.newWorld();
    for (const n of tmp.list) if (n.canon && !this.list.some((m) => m.id === n.id)) { n.ties = undefined; this.list.push(n); }
    if (ACTIVE_WORLD !== 'human') this.ensureWorldNpcs(ACTIVE_WORLD);
    this.reindex();
    this.game.rel?.ensureTies();
  }

  /** 旧版统一大地图存档 → 三图：重建众生，保留原著人物与红颜的状态（境界、好感、仇怨、生死、相识） */
  mergeLegacy(a: NpcData[] | undefined) {
    this.newWorld();
    this.lastDay = Math.floor(this.game.day);
    if (!a) return;
    const keep: (keyof NpcData)[] = ['realm', 'stage', 'favor', 'grudge', 'met', 'alive', 'age', 'life', 'deathNote', 'taught', 'spar', 'hidden', 'lastTalk'];
    for (const o of a) {
      const n = this.byId.get(o.id); if (!n || !(n.canon || n.beauty)) continue;
      for (const k of keep) if (o[k] !== undefined) (n as any)[k] = o[k];
    }
  }

  // ------------------------------------------------------------ 工具
  /** 外貌（人物引擎按 look 现场画；对话立绘不再查图，见 data/portraits.ts） */
  look(d: NpcData): Look { return this.lookRaw(d); }
  private lookRaw(d: NpcData): Look {
    if (d.beauty) return beautyLook(d.beauty);
    let s = d.seed;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    let L = randomLook(rnd, d.role);
    const hasPersonalCanonRobe = !!(d.canon && d.robe && d.sect && d.robe !== SECT_ROBE[d.sect]);
    if (d.sect && !d.mlook && !hasPersonalCanonRobe) {
      const tier: 0 | 1 | 2 = d.realm >= 3 || d.role === 'elder' ? 2 : d.realm >= 2 ? 1 : 0;
      const custom = d.sect === MY_SECT_ID ? this.game.ws.mySect?.uniform : undefined;
      L = applySectUniform(L, d.sect, tier, d.robe, custom);
    } else {
      if (d.robe) { L.robe = d.robe; }
      if (d.faction === 'demon' && !d.robe) L.robe = ['#3a1418', '#22222c', '#2a1a2a'][d.seed % 3];
    }
    if (d.realm >= 3 && d.age > 200 && d.role !== 'female') { L.hair = '#d8d4cc'; L.beard = d.role === 'elder' ? '#e4e0d8' : L.beard; }
    if (d.mlook) Object.assign(L, d.mlook);
    return L;
  }
  power(d: NpcData) { return lv(d.realm, d.stage); }
  playerLv() { const h = this.game.hero; return lv(h.realm, h.stage); }
  realmText(d: NpcData) { return d.realm === 0 ? '凡人' : realmName(d.realm, d.stage); }
  sectLabel(d: NpcData): string {
    if (!d.sect) return '';
    if (d.sect === 'mysect') return this.game.ws.mySect?.name ?? '';
    return LOC_BY_ID.get(d.sect)?.name ?? '';
  }
  formatNpcLabel(d: NpcData): string {
    const sect = this.sectLabel(d);
    const base = sect ? `${sect}·${d.name}` : d.name;
    return d.realm === 0 ? base : `${base}·${this.realmText(d)}`;
  }
  senseOf(d: NpcData) {
    const mapWorld = worldOfMap(d.map ?? ACTIVE_MAP);
    const raw = REALMS[d.realm].sense[Math.min(d.stage, REALMS[d.realm].sense.length - 1)] ?? 0;
    const s = Math.round(raw * worldStatScale(d.realm, mapWorld));
    return baseSenseRange(s, 1, 300, mapWorld);
  }
  private isHelping(d: NpcData): boolean {
    return (d.helpUntilDay ?? 0) > this.game.day || (d.helpUntil ?? 0) > this.game.time;
  }
  hostileTo(d: NpcData) {
    const rep = this.game.ws.rep;
    if (d.grudge > 0) return true;
    if (d.bond || this.isHelping(d)) return false;
    if (this.game.rel?.hostileExtra(d)) return true;
    // 第三十六步：名册门人守山门的规矩——宗门未与你翻脸，就不会无故出手
    if (d.ros && !d.hunting) return false;
    // 第四十步：大城坐镇的老怪守城里的规矩——不惹他，他也懒得理你
    if (d.gz && !d.hunting) return false;
    if (d.faction === 'demon' && (d.pers === 'ruthless' || d.pers === 'greedy')) return true;
    if ((d.pers === 'greedy' || d.pers === 'ruthless') && d.faction === 'rogue') return true;
    if (d.pers === 'righteous' && rep < -40) return true;
    return false;
  }
  private pickTarget(d: NpcData, rnd = Math.random) {
    if (this.game.living?.steer(d, rnd)) return;   // 第四十三步：有打算的人照着打算走
    if (d.stay || d.beauty) { const h = LOC_BY_ID.get(d.home) ?? locsOf(npcMap(d))[0]; if (!h) return; const q = this.homeAt(h, rnd, 900, 600, 200); d.tx = q.x; d.ty = q.y; d.goal = 'stay'; return; }
    const r = rnd();
    const cur = { x: d.x / WORLD_SCALE, y: d.y / WORLD_SCALE };
    if (r < 0.35) { const h = LOC_BY_ID.get(d.home) ?? locsOf(npcMap(d))[0]; if (!h) return; const q = this.homeAt(h, rnd, 1200, 900); d.tx = q.x; d.ty = q.y; d.goal = 'stay'; return; }
    const far = rnd() < 0.12;
    const cands = locsOf(npcMap(d)).filter((l) => { const dd = Math.hypot(l.x - cur.x, l.y - cur.y); return far ? dd < 260 : dd < 70 && dd > 4; }).filter((l) => d.faction === 'mortal' ? l.type === 'town' || l.type === 'city' : true);
    const l = cands.length ? cands[Math.floor(rnd() * cands.length)] : (LOC_BY_ID.get(d.home) ?? locsOf(npcMap(d))[0]);
    if (!l) return;
    { const q = this.homeAt(l, rnd, 1000, 700); d.tx = q.x; d.ty = q.y; }
    d.goal = l.type === 'danger' ? 'hunt' : l.type === 'secret' ? 'gather' : 'travel';
  }

  private simPhase = 0;

  // ------------------------------------------------------------ 每帧
  update(dt: number) {
    const g = this.game;
    if (g.paused) return;
    // 日结算：实时逐日推进时把 living 400+ 人分 4 帧切片执行，消除跨天尖峰
    g.living?.stepDailySlice();
    const day = Math.floor(g.day);
    if (this.lastDay < 0) this.lastDay = day;
    if (day > this.lastDay) { this.daily(day - this.lastDay, true); this.lastDay = day; }
    // 神识外粗模拟与在场列表刷新错峰到 0.25s 交替拍，避免每 0.5s 同帧叠加；
    // 高速飞行位移超过 350 世界单位时立即刷新在场列表，防止远处 NPC 被身后残留名额挡住而整批闪现
    const p = g.player;
    this.simT -= dt;
    const movedSinceRefresh = !Number.isFinite(this.lastRefreshX) || Math.hypot(p.x - this.lastRefreshX, p.y - this.lastRefreshY) >= 350;
    if (this.simT <= 0) {
      this.simT = 0.25;
      if ((this.simPhase ^= 1) === 1) this.coarse(0.5);
      else this.refreshActive();
    } else if (movedSinceRefresh) {
      this.refreshActive();
    }
    // 活跃者完整行为（P5：远处非交互 NPC 按 cadence=2/4 错帧并累积 dt，速度不变）
    this.frameTick = (this.frameTick + 1) & 0x7fffffff;
    this.focus = null; let best = 190;
    let idx = 0;
    for (const a of this.active.values()) {
      const dd = Math.hypot(a.st.x - p.x, a.st.y - p.y);
      const engaged = !!a.enemy || !!a.duel || a.act === 'approach' || a.act === 'follow' || (a.castT ?? 0) > 0;
      const cad = engaged || dd < 1500 ? 1 : dd < 3200 ? 2 : 4;
      idx++;
      if (cad > 1 && ((this.frameTick + idx) % cad) !== 0) {
        a.accDt = (a.accDt ?? 0) + dt;
        continue;
      }
      const stepDt = dt + (a.accDt ?? 0);
      a.accDt = 0;
      const x0 = a.st.x, y0 = a.st.y;
      this.behave(a, stepDt);
      this.suppress(a, x0, y0, stepDt);
      this.game.living?.onscreen(a, stepDt);
      if (a.d.alive && !a.enemy) reactTick(g, a as any, stepDt, dd);
      if (!a.enemy && a.d.alive && dd < best && g.life.vis({ x: a.st.x, y: a.st.y }) > 0.5) { best = dd; this.focus = a; }
    }
    // 名牌配额：每 0.25 秒更新一次神识内圈可见 NPC 名牌集合（缓存 sprite 绘制，放宽至 64 人兼顾全显与极端拥挤性能）
    this.labelT -= dt;
    if (this.labelT <= 0) {
      this.labelT = 0.25;
      const cand = this.labelCand; cand.length = 0;
      const senseR = Math.max(1200, (g.detailSenseRadius || 1200) + 240);
      for (const a of this.active.values()) {
        if (!a.d.alive) continue;
        const dd = Math.hypot(a.st.x - p.x, a.st.y - p.y);
        if (dd <= senseR) cand.push({ id: a.d.id, d: dd });
      }
      cand.sort((x, y) => x.d - y.d);
      this.labelSet.clear();
      for (let i = 0; i < cand.length && i < 64; i++) this.labelSet.add(cand[i].id);
    }
    if (this.speakT > 0) this.speakT = Math.max(0, this.speakT - dt);    this.noticeT -= dt;
    if (this.noticeT <= 0) { this.noticeT = 0.7; this.senseCheck(); }
    this.duelT -= dt;
    if (this.duelT <= 0) { this.duelT = 3 + Math.random() * 4; this.maybeDuel(); }
    // 围观苏寒斗法
    this.watchT -= dt;
    if (this.watchT <= 0) { this.watchT = 3; if (g.combat.inCombat && !g.combat.safeAt(p.x, p.y)) this.gatherWatchers(p.x, p.y, [], true); }
    // 第四十六步：街头偶发——迎亲队伍
    this.paradeT -= dt;
    if (this.paradeT <= 0) { this.paradeT = 150 + Math.random() * 200; maybeParade(g, [...this.active.values()] as any); }
  }
  /** 第四十六步：群体反应（突破天象等）——周围的人停下、看过来、喊、跪 */
  exclaim(x: number, y: number, r: number, lines: string[], mode: 'watch' | 'bow' | 'kneel') { exclaimAll(this.game, this.active.values() as any, x, y, r, lines, mode); }

  /** 光阴流逝（含闭关）：统一由 living.ts 依灵根与丹药推演修为破境，npc.ts 仅负责衰老、坐化、补员与清理 */
  private dailyHead(days: number) {
    const g = this.game;
    const rnd = Math.random;
    const aliveByMap = Object.fromEntries(ALL_MAP_IDS.map((m) => [m, 0])) as Record<MapId, number>;
    for (let i = 0; i < this.list.length; i++) {
      const d = this.list[i];
      if (!d.alive) continue;
      d.age += days / 360;
      if (d.goal === 'hunt' && !this.active.has(d.id) && rnd() < 1 - Math.pow(1 - 0.0012 * Math.max(1, (LOC_BY_ID.get(d.home)?.danger ?? 1)), days)) this.die(d, '死于妖兽之口');
      if (d.age > d.life) this.die(d, '寿元耗尽，坐化');
      if (!d.alive) continue;
      if (!d.canon && !d.ros) aliveByMap[npcMap(d)] = (aliveByMap[npcMap(d)] ?? 0) + 1;
      if (days > 20 && !this.active.has(d.id) && !d.stay) { d.x = d.tx; d.y = d.ty; this.pickTarget(d); }
      // 远行：筑基以上的散修 / 商人偶尔远赴他乡（本界域各图之间往来）
      if (!d.canon && !d.beauty && !d.stay && !this.active.has(d.id) && (d.faction === 'rogue' || d.faction === 'merchant') && d.realm >= 2 && rnd() < 1 - Math.pow(1 - 0.00025, days)) this.migrate(d, rnd);
    }
    // 补员：当前位面各图新入道修士
    for (const m of MAP_IDS) {
      const alive = aliveByMap[m] ?? 0, cap = (POP[m] ?? 60) - 10;
      if (alive >= cap) continue;
      const homes = locsOf(m).filter((l) => l.type !== 'danger' && l.type !== 'secret');
      if (!homes.length) continue;
      const rr = mulberry32((g.day * 7919 + m.length * 131) | 0);
      for (let i = alive; i < cap && i < alive + Math.max(1, Math.round(days / 10)); i++) {
        const n = this.spawnRandom(rr, homes[Math.floor(rr() * homes.length)], 'm' + m[0] + Math.floor(g.day) + '_' + i);
        if (ACTIVE_WORLD === 'human' && n.faction !== 'mortal') { n.realm = 1; n.stage = 0; }
        n.age = 16 + rr() * 6;
        this.list.push(n); this.byId.set(n.id, n);
      }
    }
  }
  daily(days: number, sliced = false) {
    const g = this.game;
    this.dailyHead(days);
    if (!sliced) this.lastDay = Math.floor(g.day);
    if (sliced && days <= 2) g.living?.beginDailySlice(days);
    else g.living?.daily(days);   // 第四十三步：活世界——众生各自过日子（含灵根/丹药破境）
    // 清理未结识且已故的散修（保留原著人物、相识者、羁绊与子嗣）
    if (this.list.length > 960) {
      g.living?.flushDailySlice();
      this.list = this.list.filter((n) => n.alive || n.canon || n.met || !!n.bond || (n.grudge ?? 0) > 0 || n.born !== undefined);
      this.reindex();
    }
  }
  /** 远赴他方：落脚到本界域某处城镇 / 海岛 */
  migrate(d: NpcData, rnd = Math.random) {
    const from = npcMap(d);
    const wId = worldOfMap(from);
    const sameWorldMaps = WORLDS[wId].maps as MapId[];
    const isRogueYY = wId === 'human' && d.realm >= 4 && !d.canon && !d.ros && d.faction !== 'sect' && d.faction !== 'demon';
    let opts: MapId[] = wId === 'human' ? ['renjie'] : sameWorldMaps.filter((m) => m !== from);
    if (isRogueYY && wId !== 'human') opts = opts.filter((m) => canHoldRogueYuanying(this.list, m));
    if (!opts.length) return;
    const to = opts[Math.floor(rnd() * opts.length)];
    const regOf = (l: LocDef) => l.ox >= 630 && l.oy >= 290 ? 'luanxing' : l.oy < 262 ? 'dajin' : 'tiannan';
    const curLoc = LOC_BY_ID.get(d.home);
    const curReg = curLoc ? regOf(curLoc) : 'tiannan';
    let homes = locsOf(to).filter((l) => l.type === 'city' || l.type === 'isle' || (l.type === 'town' && !l.minor));
    if (wId === 'human') {
      const other = homes.filter((l) => regOf(l) !== curReg && (d.realm >= 3 || regOf(l) !== 'dajin'));
      if (other.length) homes = other;
    }
    const h = homes[Math.floor(rnd() * homes.length)]; if (!h) return;
    const toReg = regOf(h);
    d.map = to; d.home = h.id; d.sect = undefined;
    { const q = this.homeAt(h, rnd, 1200, 900); d.x = d.tx = q.x; d.y = d.ty = q.y; } d.goal = 'stay';
    if (d.met && d.favor > 10) this.game.news(`传闻${d.name}已${wId === 'human' ? (toReg === 'luanxing' ? '经上古传送阵远赴沧溟海' : toReg === 'dajin' ? '横穿天穹草原，北上中州去了' : '回到了南荒') : '远赴它域'}，落脚于${h.name}。`, 'rumor');
  }
  die(d: NpcData, why: string) {
    if (!d.alive) return;
    d.alive = false; d.deathNote = why;
    this.game.living?.onDeath(d, why);
    const a = this.active.get(d.id);
    if (a) this.active.delete(d.id);
    if (d.met && (d.favor > 30 || d.canon)) this.game.news(`噩耗：${d.name}${why}。`, 'personal');
    const R = this.game.rel;
    if (R) {
      if (d.bond === 'sworn' || d.bond === 'master' || d.bond === 'disciple' || d.bond === 'companion') { this.game.toast(`噩耗：你的${({ sworn: '结义' + (d.sex === 'f' ? '姐姐' : '兄长'), master: '师父', disciple: '徒儿', companion: '同伴' } as any)[d.bond]}${d.name}${why}！`, 'warn'); R.log(`${d.name}${why}。`, 'bad'); }
      if ((d.grudge ?? 0) >= 2 && d.met) R.log(`仇人${d.name}${why}。`, 'info');
      R.S.wanted = R.S.wanted.filter((w) => w.by !== d.id);
      d.hunting = false;
    }
  }

  private coarse(dt: number) {
    const chasing = this.game.pursuit?.cur;
    for (const d of this.list) {
      if (d.chasing && (!chasing || (chasing.e.npcId !== d.id && !chasing.wings.some((w) => w.npcId === d.id)))) d.chasing = false;   // 读档后残留
      if (!d.alive || this.active.has(d.id) || d.chasing) continue;
      if (d.hunting && npcMap(d) === ACTIVE_MAP) { d.tx = this.game.player.x; d.ty = this.game.player.y; }
      const dx = d.tx - d.x, dy = d.ty - d.y, dd = Math.hypot(dx, dy);
      if (dd < 60) {
        if (d.until <= this.game.day) {
          if (d.goal !== 'stay' || Math.random() < 0.02) { d.until = this.game.day + (d.stay ? 2 : 5 + Math.random() * 40); this.pickTarget(d); }
        }
        continue;
      }
      const sp = (d.realm >= 2 ? REALMS[d.realm].speed * 1.8 : REALMS[d.realm].speed) * worldSpeedScale(d.realm, ACTIVE_WORLD) * dt * (d.hunting ? 1.6 : 1);
      d.x += dx / dd * Math.min(sp, dd); d.y += dy / dd * Math.min(sp, dd);
    }
  }

  private refreshActive() {
    const g = this.game, p = g.player;
    this.lastRefreshX = p.x; this.lastRefreshY = p.y;
    const R = Math.max(2600, g.senseRadius * 1.5, g.detailSenseRadius + 600), R2 = R + 900;
    const prio = new Set<string>();
    if (g.destination?.followNpcId) prio.add(g.destination.followNpcId);
    if (g.guide?.followNpcId) prio.add(g.guide.followNpcId);
    for (const inv of g.friends?.S?.invites ?? []) if (!inv.done && !inv.declined) prio.add(inv.npc);
    for (const j of g.war?.inbox ?? []) if (!j.done) { if (j.foeId) prio.add(j.foeId); if (j.fromId && j.kind === '求救') prio.add(j.fromId); }
    const sos = (g.ws?.flags as any)?.sos;
    if (sos?.id) prio.add('b_' + sos.id);
    // 先清理离场者再补入新近 NPC，防止高速飞行时身后残留者占满配额导致前方标记整批晚半拍才出现
    for (const [id, a] of this.active) {
      const d = a.d;
      if (!d.alive || d.hidden || d.chasing || npcMap(d) !== ACTIVE_MAP) {
        if (d.hidden || npcMap(d) !== ACTIVE_MAP) this.active.delete(id);
        continue;
      }
      if (!a.enemy && a.act !== 'follow' && !d.hunting && !prio.has(id)) {
        const dd = Math.hypot(a.st.x - p.x, a.st.y - p.y);
        if (dd > R2) this.active.delete(id);
      }
    }
    const enter: { d: NpcData; dd: number; imp: boolean }[] = [];
    for (const d of this.list) {
      if (!d.alive || d.hidden || d.chasing || npcMap(d) !== ACTIVE_MAP) continue;
      if (this.active.has(d.id)) continue;
      const dd = Math.hypot(d.x - p.x, d.y - p.y);
      if (dd < R) enter.push({ d, dd, imp: !!(d.hunting || prio.has(d.id)) });
    }
    if (!enter.length) return;
    enter.sort((a, b) => (a.imp === b.imp ? a.dd - b.dd : a.imp ? -1 : 1));
    const innerGuard = g.detailSenseRadius + 240;
    for (const item of enter) {
      const d = item.d;
      if (this.active.size >= 40 && !item.imp) {
        // 若神识内圈内仍有新进 NPC，淘汰掉最远且已在内圈之外的非核心 NPC，确保内圈标记永不丢失或闪烁
        if (item.dd <= innerGuard) {
          let farId: string | null = null, farD = item.dd;
          for (const [aid, a] of this.active) {
            if (a.enemy || a.act === 'follow' || a.d.hunting || prio.has(aid) || a === this.focus) continue;
            const ad = Math.hypot(a.st.x - p.x, a.st.y - p.y);
            if (ad > innerGuard && ad > farD) { farD = ad; farId = aid; }
          }
          if (farId) this.active.delete(farId);
          else continue;
        } else {
          continue;
        }
      }
      if (d.realm < 2 && g.terrain.walkFactor(d.x, d.y) <= 0) {
        const loc = LOC_BY_ID.get(d.home);
        if (loc && loc.map === ACTIVE_MAP) {
          const q = this.homeAt(loc, Math.random, 700, 500);
          d.x = d.tx = q.x; d.y = d.ty = q.y;
        }
      }
      const st = new CharState(d.x, d.y);
      this.active.set(d.id, { d, st, look: this.look(d), act: 'idle', castT: 0, t: 0, wait: Math.random() * 3, noticed: 0, hp: 1, bolts: [], allyCd: 1, mindT: 5 + Math.random() * 26 });
    }
  }

  // ------------------------------------------------------------ 行为
  /**
   * 威压规则：仅在神识外放（senseBurstT > 0）且未敛息时，神识范围内的 NPC 才受威压：
   * 低两个大境界及以上直接不能动（2）；低一个大境界或同境界（高/平阶）按算法降速（1）。
   */
  private supOf(a: Active): number {
    const g = this.game, d = a.d, h = g.hero, p = g.player;
    if (a.enemy || !d.alive || a.act === 'follow' || d.bond || this.isHelping(d) || g.concealed || h.dead || !(g.senseBurstT > 0)) return 0;
    const gap = h.realm - d.realm;
    if (gap < 0) return 0;
    if (gap === 0 && h.stage < d.stage) return 0;
    if (Math.hypot(a.st.x - p.x, a.st.y - p.y) > g.senseRadius) return 0;
    return gap >= 2 ? 2 : 1;
  }
  private suppress(a: Active, x0: number, y0: number, dt: number) {
    const lv = this.supOf(a), st = a.st, h = this.game.hero;
    if (lv !== (a.sup ?? 0)) {
      if (lv > (a.sup ?? 0)) {
        // 动态关联普通 NPC：移动、隐藏、离场或转为战斗实体后不泄露旧提示。
        const world = this;
        const source = { get x() { return st.x; }, get y() { return st.y; },
          get gone() { return !a.d.alive || !!a.d.hidden || !!a.enemy || world.active.get(a.d.id) !== a; } };
        this.game.combat.sup.onset(st.x, st.y, lv, true, false, source);
      }
      a.sup = lv; a.supOn = 0;
    }
    else if (lv) a.supOn = (a.supOn ?? 0) + dt;
    if (!lv) return;
    const k = supMul(lv, a.d.realm, h.realm, h.stage, a.d.stage);
    st.x = x0 + (st.x - x0) * k; st.y = y0 + (st.y - y0) * k; a.d.x = st.x; a.d.y = st.y;
    st.speed *= k;
    if (lv >= 2) { st.lift *= Math.pow(0.02, dt); if (a.act === 'walk' || a.act === 'fly' || a.act === 'approach' || a.act === 'flee') st.setAction('idle'); }
  }
  private behave(a: Active, dt: number) {
    const g = this.game, d = a.d, st = a.st, T = g.terrain, p = g.player;
    a.t += dt;
    if (a.bubble) { a.bubble.t -= dt; if (a.bubble.t <= 0) a.bubble = undefined; }
    a.bolts = a.bolts.filter((b) => (b.t += dt) < 0.45);
    // 已化为敌人：位置跟随战斗实体
    if (a.enemy) {
      const e = a.enemy;
      if (!g.combat.enemies.includes(e)) {
        a.enemy = undefined;
        if (e.dead && !e.spar) return;
        d.x = st.x = e.x; d.y = st.y = e.y;
      } else { d.x = st.x = e.x; d.y = st.y = e.y; return; }
    }
    // 跟随（红颜同行）
    if (a.act === 'follow') {
      // 第三十六步：多人同行时散成阵形，不再叠在一处
      let tx = p.x - 70 * Math.sin(p.st.yaw + 0.9), ty = p.y - 40 * Math.cos(p.st.yaw + 0.9);
      if (!d.beauty) { let k = 0, i = 0; for (const o of this.active.values()) { if (o.act !== 'follow' || o.d.beauty) continue; if (o === a) i = k; k++; } if (k > 1 || i > 0) { const an = p.st.yaw + Math.PI + (i - (k - 1) / 2) * 0.55; tx = p.x + Math.sin(an) * (110 + (i % 2) * 50); ty = p.y + Math.cos(an) * (70 + (i % 2) * 30); } }
      // v0.54：友人录里下令「原地等候」
      const wa = (d as any).waitAt as { x: number; y: number } | undefined; if (wa) { tx = wa.x; ty = wa.y; }
      const dx = tx - st.x, dy = ty - st.y, dd = Math.hypot(dx, dy);
      if (dd > 2400) { st.x = tx; st.y = ty; }
      const canFly = d.realm >= 2 && !(d as any).noFly && !((a as any).downT > 0);
      const sp = dd < 40 ? 0 : Math.min(dd * 3, canFly || p.flying ? 900 : g.speed * 1.3);
      const fly = (canFly && (sp > 0 || p.flying)) || (p.flying && dd > 900);
      if (sp > 0) { st.x += dx / dd * sp * dt; st.y += dy / dd * sp * dt; st.faceToward(dx, dy); }
      st.lift += ((fly ? 92 : 0) - st.lift) * Math.min(1, dt * (fly ? 6 : 4));
      // 盟友助战/出手是"一次性动作"：用 castT 保持 0.35s，避免下一帧就被基础动作覆盖；飞行时保留飞行腿姿与脚下飞剑
      if ((a.castT ?? 0) > 0) {
        a.castT = (a.castT ?? 0) - dt;
        st.gait = (fly || st.lift > 12) ? 'fly' : (sp > 0 ? (sp > 200 ? 'run' : 'walk') : null);
        st.setAction('cast');
      } else {
        st.gait = null;
        st.setAction(fly ? 'fly' : sp > 0 ? (sp > 200 ? 'run' : 'walk') : p.sitting ? 'sit' : 'idle');
      }
      st.speed = sp;
      g.shen?.leash(a);   // v0.54.2：元婴出窍时走不出肉身左近
      d.x = st.x; d.y = st.y;
      // 助战
      const ying = !!g.shen?.isYing(a);
      a.allyCd -= dt * (ying ? 1.6 : 1);
      if (a.allyCd <= 0 && !((a as any).downT > 0)) {
        a.allyCd = 1.4 + Math.random() * 0.8;
        let tgt: Enemy | null = null, bd = 700;
        for (const e of g.combat.enemies) if (!e.dead && !e.spar && e.aggro && !(e as any).noP) { const de = Math.hypot(e.x - st.x, e.y - st.y); if (de < bd) { bd = de; tgt = e; } }
        if (tgt) {
          const R = REALMS[d.realm], s = Math.min(d.stage, R.atk.length - 1);
          a.castT = 0.35;
          st.castPose(); st.faceToward(tgt.x - st.x, tgt.y - st.y);
          // v0.54.2：结丹以上的友人会化形、元婴友人会出窍、阵修友人会布阵
          if (!g.shen?.allyTurn(a, tgt)) g.combat.allyStrike(st.x, st.y - st.lift, tgt, R.atk[s] * 1.6 * (ying ? 1.3 : 1), ying ? '255,215,140' : BEAUTY_BY_ID[d.beauty ?? '']?.color ?? '200,230,255', d.realm);
        }
      }
      st.update(dt);
      return;
    }
    // 斗法
    if (a.duel) {
      const du = a.duel, f = du.foe;
      if (!f.d.alive || !this.active.has(f.d.id)) { a.duel = undefined; a.act = 'idle'; return; }
      st.faceToward(f.st.x - st.x, f.st.y - st.y); st.speed = 0;
      du.cd -= dt; du.t += dt;
      // 保持距离、游走
      const dx = f.st.x - st.x, dy = f.st.y - st.y, dd = Math.hypot(dx, dy) || 1;
      const want = 260, k = (dd - want) / dd;
      st.x += dx * k * dt * 1.2 + Math.cos(a.t * 1.3 + d.seed) * 40 * dt; st.y += dy * k * dt * 1.2 + Math.sin(a.t * 1.1 + d.seed) * 30 * dt;
      st.lift += (((d.realm >= 2) ? 60 : 0) - st.lift) * Math.min(1, dt * 3);
      st.setAction(du.cd < 0.25 ? 'cast' : 'idle');
      if (du.cd <= 0) {
        du.cd = 0.8 + Math.random() * 0.7;
        const col = d.faction === 'demon' ? '220,50,70' : d.realm >= 2 ? '170,230,255' : '255,170,90';
        a.bolts.push({ x: st.x, y: st.y - 50 - st.lift, x2: f.st.x, y2: f.st.y - 40 - f.st.lift, t: 0, col });
        const gap = this.power(d) - this.power(f.d);
        f.duel && (f.duel.hp -= clamp(0.11 * Math.pow(1.18, gap), 0.02, 0.6) * (0.7 + Math.random() * 0.6));
        if (f.duel && f.duel.hp <= 0) this.endDuel(a, f);
      }
      d.x = st.x; d.y = st.y; st.update(dt);
      return;
    }
    // 劫道：靠近玩家
    if (a.act === 'approach') {
      if (a.parley && !g.modal) { a.parley = false; this.toEnemy(a, true); return; }   // 对峙时一言不发地走开：视同动手
      const dx = p.x - st.x, dy = p.y - st.y, dd = Math.hypot(dx, dy);
      const sp = d.realm >= 2 ? 420 : 200;
      st.faceToward(dx, dy); st.setAction(d.realm >= 2 ? 'fly' : 'run'); st.speed = sp;
      st.lift += ((d.realm >= 2 ? 80 : 0) - st.lift) * Math.min(1, dt * 3);
      st.x += dx / dd * sp * dt; st.y += dy / dd * sp * dt;
      d.x = st.x; d.y = st.y; st.update(dt);
      if (dd < 520) {
        const R = g.rel;
        if (R && !a.parley && R.canParley(d) && !g.modal && !g.combat.inCombat && !g.hero.dead) {
          a.parley = true; st.setAction('idle');
          g.openDialog(R.parleyNode(d, a.look, () => { a.parley = false; this.toEnemy(a, true); }, () => { a.parley = false; a.act = 'idle'; a.wait = 2; d.hunting = false; this.pickTarget(d); }));
          return;
        }
        if (!a.parley) this.toEnemy(a, true);
      }
      if (dd > 4200 && !d.hunting) a.act = 'idle';
      return;
    }
    if (a.act === 'flee') {
      const dx = st.x - p.x, dy = st.y - p.y, dd = Math.hypot(dx, dy) || 1;
      const sp = d.realm >= 2 ? 520 : 230;
      st.faceToward(dx, dy); st.setAction(d.realm >= 2 ? 'fly' : 'run'); st.speed = sp;
      st.lift += ((d.realm >= 2 ? 96 : 0) - st.lift) * Math.min(1, dt * 3);
      st.x += dx / dd * sp * dt; st.y += dy / dd * sp * dt; d.x = st.x; d.y = st.y; st.update(dt);
      if (dd > 3000) { a.act = 'idle'; this.pickTarget(d); }
      return;
    }
    // 追杀：循迹而来（玩家在城中安全处时，候在原地）
    if (d.hunting && !g.combat.safeAt(p.x, p.y)) { d.tx = p.x; d.ty = p.y; if (a.wait > 0.5) a.wait = 0.5; a.life = undefined; }
    // 日常
    if (a.wait > 0) {
      a.wait -= dt;
      st.speed = 0; st.lift += (0 - st.lift) * Math.min(1, dt * 3);
      // 练剑/切磋类日常由 tickAlive 每帧自行决定动作（cast/gather/sit/idle）；
      // 这里若再先设一次基础动作，会与它每帧互相覆盖，动作永远停在第 1 帧。
      const aliveLife = !!(a.life && (a.life.k as string) in ALIVE_NAME);
      if (!aliveLife) st.setAction(a.act === 'sit' ? 'sit' : a.act === 'gather' ? 'gather' : 'idle');
      if (a.life) this.lifeTick(a, dt);
      st.update(dt); return;
    }
    if (a.life && a.life.k !== 'watch') a.life = undefined;
    // 第二十二步：沿街巷绕行（被屋舍挡住时才求路）
    const path = (a as any).path as [number, number][] | undefined;
    if (path && path.length) {
      const [wx, wy] = path[0];
      if (Math.hypot(wx - st.x, wy - st.y) < 36) { path.shift(); if (!path.length) (a as any).path = undefined; }
    }
    const goal = (a as any).path?.[0] as [number, number] | undefined;
    let dx = (goal ? goal[0] : d.tx) - st.x, dy = (goal ? goal[1] : d.ty) - st.y; const dd0 = Math.hypot(dx, dy);
    const dd = goal ? Math.max(dd0, 41) : dd0;
    if (dd < 40) {
      if (a.life?.k === 'watch') { a.act = 'idle'; a.wait = 2.5; return; }
      if (!goal && this.pickLife(a)) return;
      // 到达：打坐 / 采药 / 闲立
      const r = Math.random();
      if (d.goal === 'gather' || (d.faction !== 'mortal' && r < 0.25)) { a.act = 'gather'; a.wait = 3 + Math.random() * 5; }
      else if (d.faction !== 'mortal' && r < 0.55) { a.act = 'sit'; a.wait = 6 + Math.random() * 14; }
      else { a.act = 'idle'; a.wait = 2 + Math.random() * 5; }
      if (d.plan && d.plan.until >= this.game.day - 1) {
        this.pickTarget(d);
      } else if (d.stay || Math.random() < 0.5) {
        const h = LOC_BY_ID.get(d.home)!; const sp = d.stay ? 1100 : 1400;
        const q = h && this.game.space?.spot && h.map === ACTIVE_MAP && Math.hypot(h.x * WORLD_SCALE - d.x, h.y * WORLD_SCALE - d.y) < 5000 ? this.game.space.spot(h) : null;
        if (q) { d.tx = q.x; d.ty = q.y; }
        else { d.tx = (d.stay ? h.x * WORLD_SCALE : d.x) + (Math.random() - 0.5) * sp; d.ty = (d.stay ? h.y * WORLD_SCALE + 200 : d.y) + (Math.random() - 0.5) * sp * 0.6; }
      }
      else this.pickTarget(d);
      return;
    }
    const flying = d.realm >= 2 && !(d as any).noFly && !((a as any).downT > 0);
    const sp = flying ? (d.realm >= 3 ? 620 : 420) : d.faction === 'mortal' ? 70 : 105;
    dx /= dd; dy /= dd;
    // 避开正在交兵的宗门战区与非己方战时大营/外围哨卡禁区，严禁路人或敌宗闲人逛进交战阵线
    const sw = g.sectwar;
    if (sw && !d.bond && !d.beauty && !d.hunting) {
      const wzs = sw.activeWarZones?.(ACTIVE_MAP) ?? [];
      for (const wz of wzs) {
        const wx = st.x - wz.x, wy = st.y - wz.y, wd = Math.hypot(wx, wy);
        if (wd < wz.r && wd > 1) {
          dx = wx / wd; dy = wy / wd;
          d.tx = wz.x + dx * (wz.r + 750); d.ty = wz.y + dy * (wz.r + 750);
          (a as any).path = undefined;
          break;
        }
      }
      const intr = sw.findCampIntrusion?.(st.x + dx * 120, st.y + dy * 120, ACTIVE_MAP);
      if (intr) {
        const sideSects = sw.sideSects(intr.w, intr.side);
        const homeSect = d.ros ? d.ros[0] : (d.home && sideSects.includes(d.home) ? d.home : undefined);
        if (!homeSect || !sideSects.includes(homeSect)) {
          const cx = st.x - intr.cmp.x, cy = st.y - intr.cmp.y, cd = Math.hypot(cx, cy) || 1;
          dx = cx / cd; dy = cy / cd;
          d.tx = intr.cmp.x + dx * 2200; d.ty = intr.cmp.y + dy * 2200;
          (a as any).path = undefined;
        }
      }
    }
    // 未敛息的正常感知：同境界玩家高阶时害怕绕道；低一个大境界时远远避开
    if (!g.concealed && !d.bond && !this.isHelping(d) && !d.beauty && !d.stay && !d.hunting && d.realm > 0) {
      const h = g.hero;
      const dp = Math.hypot(st.x - p.x, st.y - p.y);
      const rGap = h.realm - d.realm;
      if (rGap === 1 && dp < 960 && dp > 1) {
        const ox = (st.x - p.x) / dp, oy = (st.y - p.y) / dp;
        dx = ox * 0.85 + dx * 0.15; dy = oy * 0.85 + dy * 0.15;
        const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      } else if (rGap === 0 && h.stage > d.stage && dp < 460 && dp > 1) {
        const ox = (st.x - p.x) / dp, oy = (st.y - p.y) / dp;
        const side = (d.seed % 2 === 0 ? 1 : -1);
        dx = dx * 0.45 - oy * side * 0.72 + ox * 0.35;
        dy = dy * 0.45 + ox * side * 0.72 + oy * 0.35;
        const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      }
    }
    const S = this.game.space;
    const nx = st.x + dx * sp * dt, ny = st.y + dy * sp * dt;
    if (!flying && st.lift < 12 && d.realm < 2 && T.walkFactor(st.x, st.y) <= 0) {
      let rescued = false;
      for (const r of [40, 90, 160, 260]) {
        for (let k = 0; k < 12; k++) {
          const ang = (k / 12) * Math.PI * 2;
          const qx = st.x + Math.cos(ang) * r, qy = st.y + Math.sin(ang) * r;
          if (T.walkFactor(qx, qy) > 0 && (!S || !S.blocked(qx, qy))) {
            st.x = d.x = qx; st.y = d.y = qy;
            (a as any).path = undefined; this.pickTarget(d); a.wait = 0.2;
            rescued = true;
            break;
          }
        }
        if (rescued) break;
      }
      if (rescued) return;
      if (Math.hypot(st.x - p.x, st.y - p.y) >= 2600) {
        const h = LOC_BY_ID.get(d.home);
        if (h && h.map === ACTIVE_MAP) {
          const q = this.homeAt(h, Math.random, 700, 500);
          st.x = d.x = q.x; st.y = d.y = q.y; d.tx = q.x; d.ty = q.y;
          (a as any).path = undefined; a.wait = 0.5;
          return;
        }
      }
    }
    if (!flying && T.walkFactor(nx, ny) <= 0) {
      if (d.realm >= 2) { st.lift = Math.max(st.lift, 10); }
      else { this.pickTarget(d); a.wait = 1; return; }
    }
    if (!flying && st.lift < 12 && S && S.blocked(nx, ny) && !S.blocked(st.x, st.y)) {
      if (!(a as any).path) { const r = S.route(st.x, st.y, d.tx, d.ty); if (r && r.length) { (a as any).path = r; return; } }
      // 无路可绕：换个去处
      (a as any).path = undefined; this.pickTarget(d); a.wait = 1 + Math.random() * 2; return;
    }
    st.x = nx; st.y = ny; st.faceToward(dx, dy, !flying);
    st.lift += ((flying || (d.realm >= 2 && !(d as any).noFly && T.walkFactor(nx, ny) <= 0) ? 90 : 0) - st.lift) * Math.min(1, dt * (flying ? 5 : 2.5));
    const airborne = flying || st.lift > 12;
    st.setAction(airborne ? 'fly' : 'walk'); st.speed = airborne ? sp : sp * (T.walkFactor(nx, ny) || 1);
    a.act = airborne ? 'fly' : 'walk';
    d.x = st.x; d.y = st.y;
    st.update(dt);
  }

  // ------------------------------------------------------------ 第二十九步：市井日常
  /** 到达落脚点时，偶尔做点凡俗事：摆摊、钓鱼、与人闲聊 */
  private pickLife(a: Active): boolean {
    const g = this.game, d = a.d, st = a.st, T = g.terrain, r = Math.random();
    if (d.bond || d.hunting) return false;
    // 第四十六步：作息与营生（练剑、扫地、挑水、浣衣、吃茶、下棋、说书、躲雨……）
    if (pickAlive(g, a as any, [...this.active.values()] as any)) return true;
    // 摆摊：城镇里的行商、贪财散修、凡人小贩
    if ((d.faction === 'merchant' || (d.faction === 'rogue' && d.pers === 'greedy') || (d.faction === 'mortal' && d.seed % 4 === 0)) && r < 0.45) {
      const inTown = locsOf(ACTIVE_MAP).some((l) => (l.type === 'town' || l.type === 'city') && Math.hypot(l.x * WORLD_SCALE - st.x, l.y * WORLD_SCALE - st.y) < 1500);
      if (inTown && !g.space?.blocked(st.x, st.y + 40)) {
        a.life = { k: 'stall', dir: Math.PI / 2, ware: d.faction === 'mortal' ? 4 : d.seed % 4 }; a.act = 'sit'; a.wait = 25 + Math.random() * 40;
        st.faceToward(0, 1); return true;
      }
    }
    // 钓鱼：水边的凡人与闲散修士
    if ((d.faction === 'mortal' || d.pers === 'aloof' || d.pers === 'kind' || d.faction === 'rogue') && r < 0.35) {
      const a0 = Math.random() * TAU;
      for (let k = 0; k < 10; k++) {
        const ang = a0 + k * TAU / 10;
        const wet = (R: number) => { const x = st.x + Math.cos(ang) * R, y = st.y + Math.sin(ang) * R * 0.75; return !T.isLand(x, y) || T.riverEdge(x, y) < 0; };
        if (!wet(30) && (wet(150) || wet(220))) {
          a.life = { k: 'fish', dir: ang }; a.act = 'sit'; a.wait = 18 + Math.random() * 35;
          st.faceToward(Math.cos(ang), Math.sin(ang)); return true;
        }
      }
    }
    // 闲聊
    if (r < 0.5) {
      const mortal = d.faction === 'mortal';
      for (const b of this.active.values()) {
        if (b === a || !b.d.alive || b.enemy || b.duel || b.life || b.d.bond || (b.act !== 'idle' && b.act !== 'walk' && b.act !== 'sit') || (b.d.faction === 'mortal') !== mortal) continue;
        const dd = Math.hypot(b.st.x - st.x, b.st.y - st.y); if (dd > 340 || dd < 40) continue;
        const lines = this.chatLines(d, b.d);
        const dur = lines.length * 2.7 + 1.5;
        a.life = { k: 'chat', dir: 0, with: b, lines, li: 0, lt: 0.4 }; b.life = { k: 'chat', dir: 0, with: a };
        a.act = b.act = 'idle'; a.wait = b.wait = dur; (b as any).path = undefined;
        st.faceToward(b.st.x - st.x, b.st.y - st.y); b.st.faceToward(st.x - b.st.x, st.y - b.st.y);
        return true;
      }
    }
    return false;
  }
  private chatLines(A: NpcData, B: NpcData): string[] {
    const g = this.game, R = g.rel, tie = R?.tieOf(A, B.id), pk = <T,>(x: T[]) => x[Math.floor(Math.random() * x.length)];
    const r = Math.random();
    if (tie && tie.k === 'kin' && r < 0.5) return [`${relWordOf(tie.r)}，近来可好？`, pk(['老样子。你呢？', '好着呢，就是挂念你。', '还不是那样，凑合过。']), pk(['那就好。', '有空回家看看。', '回头一起喝一杯。'])];
    if (tie && tie.k === 'lover' && r < 0.5) return ['山上风大，你多添件衣裳。', '知道啦，你也是。'];
    if (tie && tie.k === 'master' && r < 0.5) return ['师父，弟子这几日功课……', '心浮气躁，再去练三个时辰。', '……是。'];
    if (A.met && r < 0.45) {
      if (A.grudge > 0 || A.favor <= -30) return ['你可知道苏寒那厮？', '嘘——小声些！', '哼，早晚叫他好看。'];
      if (A.favor >= 50) return ['你认得苏寒么？', '听说过，怎么？', '是个靠得住的人，上回还帮过我。'];
      if (A.favor >= 15) return ['前些天遇见个姓苏的道友。', '如何？', '面相平平，深不可测。'];
    }
    const tot = R?.wantedTotal() ?? 0;
    if (tot >= 300 && r < 0.6 && A.faction !== 'mortal') return ['听说有人悬赏一个姓苏的。', '多少灵石？', `${tot}！`, '……啧，我可不敢去赚这个钱。'];
    const ev = g.events.rumorFor(A); if (ev && r < 0.7) return [ev.length > 18 ? ev.slice(0, 17) + '……' : ev, '当真？', '千真万确！'];
    if (A.faction === 'mortal') return pk([['今年雨水足，收成该好。', '但愿别闹蝗灾。'], ['城里来了个说书的。', '讲的什么？', '讲仙人斗法！'], ['山里的狼又多了。', '夜里把门闩好。'], ['东家的闺女要出嫁了。', '好事，好事！'], ['昨夜天上飞过一道光。', '怕是仙师路过。', '咱们可别去招惹。']]);
    return pk([['坊市的丹药又涨价了。', '可不是，一颗难求。'], ['最近劫修多，结伴走稳妥些。', '嗯，正有此意。'], ['你那门功法修到第几层了？', '惭愧，刚摸到门槛。'], ['昨夜那道遁光你可瞧见了？', '瞧见了，怕是结丹前辈。'], ['这一带灵草被采得差不多了。', '往深山里走走罢。'], ['筑基丹……唉。', '别急，机缘总会来的。'], ['听说北边有处洞府现世。', '真的假的？', '去的人可不少。']]);
  }
  /** 日常进行中：说话、钓鱼浮漂、围观喝彩 */
  private lifeTick(a: Active, dt: number) {
    const L = a.life!, st = a.st, g = this.game;
    if ((L.k as string) in ALIVE_NAME) { tickAlive(g, a as any, dt); return; }
    if (L.k === 'chat') {
      const b = L.with;
      if (!b || !b.d.alive || b.enemy || !this.active.has(b.d.id) || b.life?.with !== a) { a.life = undefined; a.wait = Math.min(a.wait, 0.5); return; }
      st.faceToward(b.st.x - st.x, b.st.y - st.y);
      if (L.lines) {
        L.lt = (L.lt ?? 0) - dt;
        if (L.lt <= 0 && (L.li ?? 0) < L.lines.length) {
          const who = (L.li! % 2 === 0) ? a : b; who.bubble = { text: L.lines[L.li!], t: 2.4 }; who.st.setAction('idle');
          L.li!++; L.lt = 2.7;
        }
      }
      if (a.wait <= dt) { a.life = undefined; if (b.life?.with === a) b.life = undefined; }
      return;
    }
    if (L.k === 'watch') {
      st.faceToward((L.cx ?? st.x) - st.x, (L.cy ?? st.y) - st.y);
      const live = L.ware ? g.combat.inCombat && Math.hypot(g.player.x - (L.cx ?? 0), g.player.y - (L.cy ?? 0)) < 1400 : [...this.active.values()].some((o) => o.duel && Math.hypot(o.st.x - (L.cx ?? 0), o.st.y - (L.cy ?? 0)) < 700);
      if (live) { a.wait = Math.max(a.wait, 1); if (L.ware) { L.cx = g.player.x; L.cy = g.player.y; } }
      L.lt = (L.lt ?? Math.random() * 3) - dt;
      if (L.lt <= 0 && live) {
        L.lt = 3 + Math.random() * 5;
        if (Math.random() < 0.45) {
          const m = a.d.faction === 'mortal';
          const T = m ? ['我的娘哎……', '仙人打架啦！', '快看快看！', '别靠太近！'] : L.ware ? ['此人是谁？好生了得！', '好凌厉的手段……', '这般神通，怕不是结丹前辈？', '苏……苏寒？'] : ['好！', '这一手漂亮！', '押一块灵石，左边那位赢。', '离远些，当心被波及。', '啧啧，有看头。'];
          a.bubble = { text: T[Math.floor(Math.random() * T.length)], t: 2.2 };
        }
      }
      if (!live && a.wait <= dt) a.life = undefined;
      return;
    }
    if (L.k === 'fish') {
      st.setAction('sit'); st.faceToward(Math.cos(L.dir), Math.sin(L.dir));
      L.lt = (L.lt ?? 6 + Math.random() * 8) - dt;
      if (L.lt <= 0) { L.lt = 8 + Math.random() * 10; L.li = g.time; if (Math.random() < 0.35) a.bubble = { text: Math.random() < 0.5 ? '上钩了！' : '……又跑了。', t: 1.8 }; }
    }
    if (L.k === 'stall') {
      st.setAction('sit');
      L.lt = (L.lt ?? 4 + Math.random() * 6) - dt;
      if (L.lt <= 0) { L.lt = 7 + Math.random() * 9; if (Math.hypot(g.player.x - st.x, g.player.y - st.y) < 700 || Math.random() < 0.3) a.bubble = { text: (['上好的丹药，童叟无欺！', '新到的符箓，便宜卖了！', '百年灵草，走过路过莫错过！', '趁手的法器，来看看！', '热乎的炊饼，两文一个！'])[L.ware ?? 4], t: 2.4 }; }
      if (a.wait <= dt) a.life = undefined;
    }
    if (a.wait <= dt && L.k === 'fish') a.life = undefined;
  }
  /** 斗法引来围观：修士围成一圈指指点点，凡人远远探头（大战场时散开不添乱） */
  gatherWatchers(cx: number, cy: number, skip: Active[], player = false) {
    if (player && (this.game.combat.enemies.length >= 6 || this.game.sectwar?.hud())) {
      for (const o of this.active.values()) {
        if (o.life?.k === 'watch') {
          o.life = undefined;
          const ang = Math.atan2(o.st.y - cy, o.st.x - cx);
          o.d.tx = cx + Math.cos(ang) * 1400; o.d.ty = cy + Math.sin(ang) * 1100;
          o.act = 'walk';
        }
      }
      return;
    }
    let n = 0;
    for (const o of this.active.values()) {
      if (n >= (player ? 4 : 6)) break;
      if (skip.includes(o) || !o.d.alive || o.enemy || o.duel || o.d.bond || o.d.beauty || o.act === 'follow' || o.act === 'approach' || o.act === 'flee' || o.life?.k === 'watch' || o.life?.k === 'chat') continue;
      if (player && this.hostileTo(o.d)) continue;
      const dd = Math.hypot(o.st.x - cx, o.st.y - cy); if (dd > 1300 || dd < 60) continue;
      const ring = (o.d.faction === 'mortal' ? 760 : player ? 560 : 430) + Math.random() * 80;
      const ang = Math.atan2(o.st.y - cy, o.st.x - cx) + (Math.random() - 0.5) * 0.5;
      o.d.tx = cx + Math.cos(ang) * ring; o.d.ty = cy + Math.sin(ang) * ring * 0.75;
      (o as any).path = undefined; o.wait = 0; o.act = 'walk';
      o.life = { k: 'watch', dir: 0, cx, cy, ware: player ? 1 : 0 };
      n++;
    }
  }

  /** 互相以神识感知：发现玩家后的反应 */
  private senseCheck() {
    const g = this.game, p = g.player, pl = this.playerLv(), h = g.hero;
    for (const a of this.active.values()) {
      const d = a.d;
      if (!d.alive || a.enemy || a.duel || a.act === 'follow' || a.act === 'approach' || a.act === 'flee') continue;
      const dd = Math.hypot(a.st.x - p.x, a.st.y - p.y);
      const detect = this.senseOf(d) * (g.concealed ? (d.realm > h.realm ? 0.75 : 0.45) : 1);
      if (dd > detect) { a.noticed = Math.max(0, a.noticed - 0.2); continue; }
      a.noticed = Math.min(3, a.noticed + 1);
      if (a.noticed < 2) continue;
      const gap = this.power(d) - pl;
      const realmGap = h.realm - d.realm;
      // 敛息时外人只能察觉伪装后的低阶气息（炼气期/筑基初期），因此低阶劫修仍敢上前贪心拦截
      const apparentLv = g.concealed ? lv(h.realm >= 4 ? 2 : 1, h.realm >= 4 ? 0 : Math.min(h.stage, 7)) : pl;
      const apparentGap = this.power(d) - apparentLv;
      if (g.combat.safeAt(p.x, p.y) || g.combat.safeAt(a.st.x, a.st.y) || g.combat.warZoneAt(p.x, p.y) || g.combat.warZoneAt(a.st.x, a.st.y)) continue;
      const forced = !!d.hunting || d.grudge >= 2 || !!d.why?.startsWith('奉');
      // 未敛息且非仇敌：仅神识外放威压时低两境惊逃；常态只作敬畏礼让、远远避开
      if (!g.concealed && !d.bond && !this.isHelping(d) && !d.beauty && !d.stay && !forced && d.realm > 0) {
        if (realmGap >= 2 && g.senseBurstT > 0) {
          a.act = 'flee'; a.life = undefined;
          const rName = REALMS[h.realm]?.name ?? '大能';
          a.bubble = { text: h.realm >= 9 ? `${rName}仙威！快逃！` : h.realm >= 5 ? `${rName}威压！快逃！` : '前辈神识压人！晚辈速避！', t: 2.8 };
          continue;
        }
        if (realmGap >= 1) {
          if (dd < 1100 && dd > 1) {
            const ox = (a.st.x - p.x) / dd, oy = (a.st.y - p.y) / dd;
            d.tx = clamp(p.x + ox * 1380, 400, WORLD_W - 400);
            d.ty = clamp(p.y + oy * 1380, 400, WORLD_H - 400);
            (a as any).path = undefined; a.life = undefined; a.wait = 0;
            if (a.noticed === 2 && this.maySpeak()) {
              const rName = REALMS[h.realm]?.name ?? '高人';
              a.bubble = { text: realmGap >= 2 ? (h.realm >= 9 ? `${rName}大能法驾……晚辈礼让三分。` : h.realm >= 4 ? `${rName}老怪法驾……晚辈礼让三分。` : '高人在此，莫要惊扰。') : '前辈在此，晚辈远远避开。', t: 2.4 };
            }
          }
          continue;
        }
      }
      if (this.hostileTo(d) && d.realm > 0 && !d.beauty && !d.stay) {
        const novice = g.day < 420 && h.realm <= 1 && h.stage < 4 && d.grudge <= 0;   // 新手保护：开局一年内劫修少见且不会碾压
        // 正常状态下不主动招惹高境界；敛息时按伪装后的气息判断，低/同阶劫修照样敢动歪念
        const allowAttack = g.concealed ? (apparentGap >= -2 || d.grudge > 0 || forced) : (forced || (d.realm > h.realm || (d.realm === h.realm && d.stage >= h.stage)));
        if (allowAttack) {
          if (forced || Math.random() < (novice ? (apparentGap > 2 ? 0 : 0.15) : 0.28)) {
            a.act = 'approach'; a.life = undefined;
            a.bubble = { text: g.rel?.approachLine(d) || (d.grudge > 0 ? '冤家路窄！今日便了结旧账！' : d.faction === 'demon' ? '桀桀……送上门的血食。' : '道友，留下储物袋，饶你不死！'), t: 3.5 };
            // 围剿：同伙一起扑上来
            if (d.why?.startsWith('奉')) for (const o of this.active.values()) if (o !== a && o.d.why === d.why && !o.enemy && o.act !== 'approach') { o.act = 'approach'; o.life = undefined; o.bubble = { text: '结阵！', t: 2 }; }
            if (g.life.vis({ x: a.st.x, y: a.st.y }) > 0.2) g.toast(`神识中：${d.name}（${this.realmText(d)}）向你疾驰而来，来者不善！`, 'warn');
            else { g.toast('一道陌生的神识锁定了你……', 'warn'); g.renderer?.sense && (g.renderer.sense.alarm = 1); }
          }
        } else if (gap < -6 && Math.random() < 0.6 && g.senseBurstT > 0) {
          a.act = 'flee'; a.bubble = { text: '不好，是高人！', t: 2.5 };
        }
      } else if (gap < -10 && g.ws.rep < -40 && d.faction !== 'demon' && g.senseBurstT > 0) {
        a.act = 'flee'; a.bubble = { text: '是那个魔头！快走！', t: 2.5 };
      } else if (a.noticed === 2 && Math.random() < 0.3 && dd < 600 && this.maySpeak()) {
        const effGap = g.concealed ? apparentGap : gap;
        const sawImmortal = p.flying || a.sup > 0 || g.combat.inCombat || g.combat.fxq.length > 0;
        a.bubble = { text: d.faction === 'mortal' ? (sawImmortal && effGap < 0 ? '仙师好！' : '……') : effGap > 10 ? '嗯？' : effGap < -10 ? `${['晚辈', '在下'][d.seed % 2]}见过前辈！` : '道友。', t: 2.2 };
      }
    }
  }

  /** 两名修士相遇：斗法 */
  private maybeDuel() {
    const arr = [...this.active.values()].filter((a) => a.d.alive && a.d.realm > 0 && !a.enemy && !a.duel && a.act !== 'follow' && !a.d.beauty && !a.d.stay);
    const g = this.game;
    for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
      const A = arr[i], B = arr[j];
      const dd = Math.hypot(A.st.x - B.st.x, A.st.y - B.st.y);
      if (dd > 900) continue;
      if (g.combat.safeAt(A.st.x, A.st.y) || g.combat.warZoneAt(A.st.x, A.st.y)) continue;
      const evil = (x: NpcData) => x.faction === 'demon' || x.pers === 'ruthless' || x.pers === 'greedy';
      const good = (x: NpcData) => x.faction === 'sect' || x.pers === 'righteous';
      const lr = g.living?.duelReason(A.d, B.d) ?? null;   // 第四十三步：劫道 / 深仇，当着你的面发生
      const feud = !!lr || A.d.vend === B.d.id || B.d.vend === A.d.id || !!g.rel?.tieOf(A.d, B.d.id)?.k.match(/^foe$/);
      if (!feud) {
        if (!((evil(A.d) && good(B.d)) || (evil(B.d) && good(A.d)) || (evil(A.d) && evil(B.d) && Math.random() < 0.3))) continue;
        if (Math.random() > 0.35) continue;
      }
      if (A.d.bond || B.d.bond) continue;
      A.duel = { foe: B, hp: 1, cd: 0.6, t: 0 }; B.duel = { foe: A, hp: 1, cd: 1.1, t: 0 };
      A.act = B.act = 'duel';
      const atk = evil(A.d) ? A : B;
      atk.bubble = { text: feud ? (A.d.vend === B.d.id || B.d.vend === A.d.id ? '血海深仇，今日了断！' : '老冤家，又见面了！') : ['此宝有德者居之！', '找死！', '狭路相逢，休怪我心狠！'][Math.floor(Math.random() * 3)], t: 3 };
      (atk === A ? B : A).bubble = { text: feud ? '来得正好！' : ['魔修休得猖狂！', '你我素无仇怨，何必相逼！', '来得好！'][Math.floor(Math.random() * 3)], t: 3 };
      if (lr) { const atkA = lr.atk === A.d, [l1, l2] = g.living.duelLine(lr.atk, atkA ? B.d : A.d, lr.k); (atkA ? A : B).bubble = { text: l1, t: 3 }; (atkA ? B : A).bubble = { text: l2, t: 3 }; }
      A.life = B.life = undefined;
      this.gatherWatchers((A.st.x + B.st.x) / 2, (A.st.y + B.st.y) / 2, [A, B]);
      if (g.life.vis({ x: A.st.x, y: A.st.y }) > 0.3 || g.life.vis({ x: B.st.x, y: B.st.y }) > 0.3) g.toast(lr?.k === 'rob' ? `神识中：${lr.atk.name}拦路劫掠${(lr.atk === A.d ? B.d : A.d).name}！（靠近按 T 可插手）` : `神识中：${A.d.name}与${B.d.name}斗起法来！（靠近按 T 可插手）`, 'info');
      return;
    }
  }
  private endDuel(win: Active, lose: Active) {
    const g = this.game;
    win.duel = undefined; lose.duel = undefined; win.act = 'idle'; lose.act = 'idle';
    const seen = g.life.vis({ x: lose.st.x, y: lose.st.y }) > 0.3;
    const lethal = win.d.faction === 'demon' || win.d.pers === 'ruthless' || Math.random() < 0.35;
    if (lethal) {
      if (seen) g.toast(`${win.d.name}斩杀了${lose.d.name}，遗落的储物袋还在原地……`, 'warn');
      if (lose.d.vend === win.d.id) lose.d.vend = undefined; if (win.d.vend === lose.d.id) win.d.vend = undefined;
      // 第四十三步：储物袋归胜者，散落一部分在地上
      const lx = lose.st.x, ly = lose.st.y, r = this.game.living.duelEnd(win.d, lose.d, true);
      const curId = worldCurrencyId(ACTIVE_WORLD);
      const stones = ACTIVE_WORLD === 'human' ? Math.max(3, r.stones) : Math.max(1, Math.min(200, Math.round(r.stones / (ACTIVE_WORLD === 'spirit' ? 60 : 200))));
      g.combat.dropLoot(lx, ly, curId, stones);
      for (const [id, n] of r.drop) g.combat.dropLoot(lx, ly, id, n);
    } else {
      if (seen) g.toast(`${lose.d.name}不敌${win.d.name}，化作遁光逃走了。`);
      if (win.d.vend === lose.d.id && Math.random() < 0.5) win.d.vend = undefined;
      lose.act = 'flee'; this.game.living.duelEnd(win.d, lose.d, false);
    }
  }

  /** 转化为战斗中的敌人 */
  toEnemy(a: Active, aggro: boolean, spar = false) {
    const g = this.game, d = a.d;
    const defId = d.faction === 'demon' ? (d.realm >= 3 ? 'jindan_mo' : 'moxiu') : d.realm >= 2 ? 'zhujixiu' : 'bandit';
    const def = ENEMIES[defId];
    const st = Math.min(d.stage, REALMS[d.realm].hp.length - 1);
    const e = new Enemy(def, a.st.x, a.st.y, Math.max(0, d.realm), st, false, worldOfMap(d.map ?? ACTIVE_MAP));
    if (d.realm === 0) { e.maxHp = e.hp = 40; e.atk *= 0.5; }
    if (d.realm >= 3) { e.maxHp = e.hp = Math.round(e.hp * 1.3); }
    g.living?.armEnemy(e, d);   // 第四十三步：身上的功法、法器让他更难缠
    e.look = a.look; e.cs = a.st; e.name = d.name; e.shortName = d.name; e.sectName = this.sectLabel(d) || undefined; e.npcId = d.id; e.aggro = aggro; e.spar = spar;
    e.school = (d.sect && SCHOOL_ALIAS[d.sect]) ?? d.sect ?? (d.faction === 'rogue' || d.faction === 'merchant' ? 'sanxiu' : undefined);   // 第三十五步：按门派出招
    if (aggro && !spar && d.realm > 0 && !d.beauty) {
      const oy = g.orig?.yieldAt(d);
      const P: Record<Pers, number> = { kind: 0.85, cautious: 0.85, greedy: 0.8, righteous: 0.5, aloof: 0.4, arrogant: 0.3, ruthless: 0.25 };
      if (oy) e.yieldAt = oy; else if (Math.random() < P[d.pers] * (d.grudge >= 2 ? 0.5 : 1)) e.yieldAt = 0.16;
    }
    g.combat.enemies.push(e);
    a.enemy = e; a.act = 'idle'; a.duel = undefined;
    return e;
  }
  /** 第三十五步：原著人物的成名法宝——杀之必得（杀人夺宝） */
  static TREASURE: Record<string, string | string[]> = {
    lvtianmeng: 'art_pingtianchi', fengyue: 'art_tayun', jinguang: 'art_jinguangzhuan', duobaonv: 'art_yueyang', nichang: 'art_xuehongling',
    qionglaoguai: 'art_liangyihuan', fuyunzi: 'art_qingmingzhen', wuchi: 'art_qianchongfeng', wangtiansheng: 'art_juhunbo', suihun: 'art_luohunsha',
    tianku: 'art_guiluo', fangzongzhu: 'art_heifengqi', weizhanglao: 'art_wuxingzhen', luzhanglao: 'art_xuanhuangjing', lvluo: 'art_huangluosan',
    jiangyun: 'art_guanrijian', changzheng: 'art_yufengche', liudao: 'art_sanshen', qimiao: 'art_xueleizi', miaohe: 'art_leihuogong', ouyang: 'art_fengyunfan',
    hantianya: 'art_molongren', mayunlong: 'art_sifangxue', xuanqingzi: 'art_tianajian', wangtiangu: 'art_zhenhaizhong', chengtiankun: 'art_balingchi', hehuanlaomo: 'art_jingangzhao',
    qianlaomo: 'art_wuzi', wentianren: 'art_tianyang', manhuzi: 'art_zibing',
    // 第四十步：玄阴祖师的阴都尸火、上官翎的朱雀环与诛邪刺
    jiyin: 'art_tiandu', b_nangongwan: ['art_zhuque', 'art_zhuxie'],
  };
  onEnemyKilled(e: Enemy) {
    if (!e.npcId) return;
    const g = this.game, d = this.byId.get(e.npcId); if (!d) return;
    const wasHostile = this.hostileTo(d) || d.faction === 'demon' || !!(e as any).righteous;
    // 第四十三步：掉的是他储物袋里真有的东西（外加一两枚他所习功法的玉简拓本）；替人报了仇的，委托人会来致谢
    g.living.onPlayerKill(d);
    g.renxin?.onNpcKilledByPlayer(d);
    const loot = g.living.lootOf(d);
    this.die(d, '死于苏寒之手');
    const curId = worldCurrencyId(ACTIVE_WORLD);
    const stones = ACTIVE_WORLD === 'human' ? Math.max(2, loot.stones) : Math.max(1, Math.min(200, Math.round(loot.stones / (ACTIVE_WORLD === 'spirit' ? 60 : 200))));
    g.combat.dropLoot(e.x, e.y, curId, stones);
    for (const [id, n] of loot.items) g.combat.dropLoot(e.x, e.y, id, n);
    if (loot.items.length) g.toast(`${d.name}的储物袋落地：${loot.items.slice(0, 4).map(([id, n]) => itemDef(id).name + (n > 1 ? '×' + n : '')).join('、')}${loot.items.length > 4 ? '……' : ''}`, 'good');
    const tr = NpcWorld.TREASURE[d.id];
    if (tr) { const ts = Array.isArray(tr) ? tr : [tr]; for (const t of ts) g.combat.dropLoot(e.x, e.y, t, 1); g.toast(`${d.name}的成名法宝「${ts.map((t) => itemDef(t).name).join('」「')}」灵光一黯，跌落在地。`, 'good'); }
    if (wasHostile) { g.ws.rep = clamp(g.ws.rep + (d.faction === 'demon' ? 4 : 2), -100, 100); }
    else {
      g.ws.rep = clamp(g.ws.rep - (d.faction === 'sect' ? 18 : 10), -100, 100);
      g.toast(`你杀害了${d.name}——正道声望大跌。`, 'warn');
    }
    g.rel?.onPlayerKill(d, wasHostile);
    if (d.canon) g.news(`${d.name}陨落于苏寒之手。`, d.orig ? 'rumor' : 'canon');
  }
  /** 第二十九步：打到半死，对方求饶 */
  onYield(e: Enemy): boolean {
    const g = this.game, d = e.npcId ? this.byId.get(e.npcId) : null;
    if (!d || !d.alive || g.modal || g.hero.dead || !g.rel) return false;
    const a = this.active.get(d.id) ?? null, look = a?.look ?? this.look(d);
    const node = g.orig?.yieldNode(d, e, look, a) ?? g.rel.yieldNode(d, e, look, a);
    if (a) a.bubble = { text: '住手！我认栽！', t: 2 };
    g.openDialog(node);
    return true;
  }
  onSpar(e: Enemy, won: boolean) {
    const g = this.game, d = e.npcId ? this.byId.get(e.npcId) : null; if (!d) return;
    g.orig?.onSpar(d, won);
    const gap = this.power(d) - this.playerLv();
    d.spar = g.day;
    if (won) {
      d.favor = clamp(d.favor + (d.pers === 'arrogant' ? 4 : 10), -100, 100);
      const msgs: C.Msg[] = []; const exp = C.need(g.hero) * C.INSIGHT * clamp(0.03 + gap * 0.01, 0.01, 0.12);
      C.gainExp(g.hero, exp, msgs);
      g.toast(`切磋获胜！${d.name}${d.pers === 'arrogant' ? '面色铁青地拱了拱手' : '抱拳称服'}。（修为 +${Math.round(exp)}）`, 'good');
    } else {
      const msgs: C.Msg[] = []; const exp = C.need(g.hero) * C.INSIGHT * 0.02;
      C.gainExp(g.hero, exp, msgs);
      g.toast(`切磋落败，${d.name}点到为止。你从中有所领悟（修为 +${Math.round(exp)}）。`);
      d.favor = clamp(d.favor + 3, -100, 100);
    }
  }

  // ------------------------------------------------------------ 交互
  /**
   * v0.52.4：按世界坐标点人——手机没有 T 键，点谁就是谁。
   * 取点击点附近最近的一个活人（脚下往上 30 像素算身子），r 为容差。
   */
  talkTargetAt(wx: number, wy: number, r = 52): Active | null {
    let best: Active | null = null, bd = r;
    for (const a of this.active.values()) {
      if (!a.d.alive || a.enemy) continue;
      if (Math.hypot(a.st.x - this.game.player.x, a.st.y - this.game.player.y) > this.game.detailSenseRadius) continue;
      const d = Math.hypot(a.st.x - wx, a.st.y - 30 - wy);
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }
  /** T：与最近的人交谈 */
  interact(a: Active | null = this.focus) {
    if (!a) return false;
    const g = this.game, d = a.d;
    d.met = true;
    // v0.56：模组——发 talk 事件；模组 NPC 若有专属开场，先说那一段
    const mt = !a.duel && modx ? modx.npcTalk(d.id, a.look, () => this.mainNode(a)) : null;
    if (mt === false) return true;   // 模组拦下了
    if (mt) { g.openDialog(mt); return true; }
    if (d.beauty) { g.hearts.talk(d.beauty, a); return true; }
    // 若正在斗法：插手
    if (a.duel) {
      const f = a.duel.foe;
      const node: DNode = {
        speaker: '神识', title: '斗法', text: `${d.name}（${this.realmText(d)}·${PERS_NAME[d.pers]}）正与${f.d.name}（${this.realmText(f.d)}·${PERS_NAME[f.d.pers]}）斗法，法光纵横。`,
        options: [
          { label: `出手相助${d.name}`, act: () => { this.help(a, f); return null; } },
          { label: `出手相助${f.d.name}`, act: () => { this.help(f, a); return null; } },
          { label: '坐山观虎斗', act: () => null },
        ], mood: 'danger',
      };
      g.openDialog(node); return true;
    }
    g.openDialog(this.mainNode(a));
    return true;
  }
  private help(friend: Active, foe: Active) {
    const g = this.game;
    const foeHp = foe.duel?.hp ?? 0.8;
    friend.duel = undefined; foe.duel = undefined; friend.act = 'idle';
    const e = this.toEnemy(foe, true);
    e.hp = Math.round(e.hp * Math.max(0.3, foeHp));
    friend.d.favor = clamp(friend.d.favor + 35, -100, 100); friend.d.met = true;
    friend.bubble = { text: '多谢道友援手！', t: 3 };
    // 友方继续出手
    friend.act = 'idle';
    const iv = setInterval(() => {
      if (!g.combat.enemies.includes(e) || e.dead || !friend.d.alive || !this.active.has(friend.d.id)) { clearInterval(iv); if (e.dead && friend.d.alive) { friend.bubble = { text: '救命之恩，没齿难忘！', t: 4 }; g.toast(`${friend.d.name}对你感激不尽（好感大增）。`, 'good'); } return; }
      if (g.halted) return;
      const R = REALMS[friend.d.realm], s = Math.min(friend.d.stage, R.atk.length - 1);
      friend.st.setAction('cast'); friend.st.faceToward(e.x - friend.st.x, e.y - friend.st.y);
      g.combat.allyStrike(friend.st.x, friend.st.y - friend.st.lift, e, R.atk[s] * 1.2, '170,230,255', friend.d.realm);
    }, 1300);
    if (!this.hostileTo(foe.d)) g.ws.rep = clamp(g.ws.rep - 3, -100, 100);
  }

  greeting(d: NpcData) {
    const gap = this.power(d) - this.playerLv();
    const ol = this.game.orig?.greeting(d); if (ol) return ol;
    if (d.canon && CANON_LINES[d.id] && !(d.grudge > 0)) { const L = CANON_LINES[d.id]; return L[Math.floor(Math.random() * L.length)]; }
    if (d.faction === 'mortal') return MORTAL_GREET[Math.floor(Math.random() * MORTAL_GREET.length)];
    if (d.grudge >= 2) return `（${d.name}的手按在了储物袋上，指节发白）${d.why ? d.why + '……' : ''}苏寒，你还敢站到我面前？`;
    // 人心篇：贪婪/狠辣者即使怀有恶意或旧怨（grudge<=1），未撕破脸前反而满面春风迎上来！
    if (!d.canon && !d.beauty && !d.bond) {
      const mg = this.game.renxin?.maskedGreeting(d);
      if (mg) return mg;
    }
    if (!d.canon && !d.beauty && !(d.grudge > 0) && !d.bond && Math.random() < 0.45) { const pl = this.game.living?.greetLine(d); if (pl) return pl; }   // 第四十三步：照着眼下的打算说话
    if (d.grudge > 0) return '（对方冷冷地盯着你）你还敢出现在我面前？';
    if (d.bond === 'sworn') return ['兄弟！快坐，今日不醉不归！', '（对方大笑着迎上来）好兄弟，近来可好？'][d.seed % 2];
    if (d.bond === 'master') return '（师父微微颔首）功课可曾落下？';
    if (d.bond === 'disciple') return '师父！徒儿这些日子可一刻也没偷懒！';
    const effFavor = this.game.renxin ? this.game.renxin.shownFavor(d) : d.favor;
    if (effFavor >= 50) return ['道友！别来无恙？', '哈哈，又见面了，来来来，坐下说话。', '是你啊——上次的事，我一直记着。'][d.seed % 3];
    const L = GREET[d.pers];
    let s = L[Math.floor(Math.random() * L.length)].replace('{realm}', realmName(this.game.hero.realm, this.game.hero.stage));
    if (gap < -12 && d.pers !== 'aloof') s = `（对方连忙躬身）晚辈${d.name}，见过前辈！` + (d.pers === 'greedy' ? '前辈若有差遣，晚辈万死不辞。' : '');
    return s;
  }
  mainNode(a: Active): DNode {
    const g = this.game, d = a.d;
    const gap = this.power(d) - this.playerLv();
    const sectName = d.sect ? LOC_BY_ID.get(d.sect)?.name : '';
    const rawTier = g.rel ? g.rel.tier(d) : '';
    const dp = g.renxin ? g.renxin.dialogPersona(d, a.sup ?? 0) : { persLabel: PERS_NAME[d.pers], favorText: `好感 ${Math.round(d.favor)}`, seenThrough: true };
    const shownTier = !dp.seenThrough && (rawTier === '厌恶' || (rawTier === '仇人' && d.grudge < 2)) ? '相识' : rawTier;
    const title = `${this.realmText(d)}${sectName ? ' · ' + sectName : d.faction === 'rogue' ? ' · 散修' : d.faction === 'merchant' ? ' · 行商' : ''}${d.title && !sectName ? ' · ' + d.title : ''} · ${dp.persLabel} · ${shownTier && shownTier !== '陌生' ? shownTier + ' ' : ''}${dp.favorText}`;
    const opts: DOpt[] = [];
    const so = g.orig?.opts(a, title, () => this.mainNode(a)); if (so) opts.push(...so);
    if (modx) opts.push(...modx.talkOpts(d.id, a.look, title, () => this.mainNode(a)));
    const cf = g.renxin?.fakeSellerConfrontOpt(a, title, () => this.mainNode(a)); if (cf) opts.push(cf);
    const inf = g.renxin?.inspectFaceOpt(d, a.look, title, () => this.mainNode(a), a.sup ?? 0); if (inf) opts.push(inf);
    if (g.jianghu) {   // 江湖篇：托信交付 / 坏话当面问明 / 假悬赏贴榜人算账 / 神识探其所言真假
      const back = () => this.mainNode(a);
      opts.push(...g.jianghu.letterOpts(a, title, back), ...g.jianghu.smearOpts(a, title, back));
      const po = g.jianghu.posterOpt(a, title, back); if (po) opts.push(po);
      const pr = g.jianghu.probeRumorOpt(d, a.look, title, back, a.sup ?? 0); if (pr) opts.push(pr);
    }
    if (g.living) opts.push({ label: '察其根底', hint: '门派 · 功法 · 家小 · 恩仇 · 储物袋', act: () => g.living.profileNode(d, a.look, title, () => this.mainNode(a)) });
    opts.push({ label: '打听消息', act: () => ({ speaker: d.name, title, look: a.look, text: this.rumor(d), options: [...(g.jianghu?.verifyOpts(d, a.look, title, () => this.mainNode(a)) ?? []), { label: '还有别的事', act: () => this.mainNode(a) }, { label: '告辞', act: () => null }] }) });
    if (g.jianghu) { const fn = g.jianghu.fakeNameOpt(a, title, () => this.mainNode(a)); if (fn) opts.push(fn); }
    if (g.jianghu && d.faction !== 'mortal' && d.wealth > 40 && !d.canon && !d.beauty) opts.push({ label: '兜售丹药（可掺假）', hint: '如实卖出涨信义；以伪灵粉染色冒充高阶丹则是骗局——买家迟早知道', act: () => g.jianghu.fakeSellNode(a, title, () => this.mainNode(a)) });
    if (d.faction === 'merchant' || (d.faction !== 'mortal' && d.wealth > 60 && d.pers !== 'aloof')) opts.push({ label: '交易', act: () => { const month = Math.floor(g.day / 30), cacheKey = `npc:${d.id}@${month}`; g.openShop({ title: `${d.name}的货物`, desc: '（散修私货，每月随缘易换，售完即止，真伪需自辨）', stock: this.stock(d), sellRate: d.pers === 'greedy' ? 0.35 : 0.5, zone: zoneOfLoc(LOC_BY_ID.get(d.home)), isStall: true, sellerId: d.id, cacheKey }); return null; } });
    if (d.realm > 0 && gap >= -4 && d.favor >= 15) opts.push({ label: '请教修炼', hint: d.taught ? '已请教过' : '', disabled: !!d.taught, act: () => this.teach(a, title) });
    opts.push({ label: '赠礼', act: () => this.giftNode(a, title) });
    if (d.realm > 0 && d.faction !== 'mortal') opts.push({ label: '切磋', hint: d.spar && g.day - d.spar < 30 ? '近日已切磋过' : '', disabled: !!d.spar && g.day - d.spar < 30, act: () => {
      if (d.pers === 'aloof' || (d.pers === 'cautious' && d.favor < 20)) return { speaker: d.name, title, look: a.look, text: '切磋？不必了。', options: [{ label: '告辞', act: () => null }] };
      a.bubble = { text: '请！', t: 2 };
      this.toEnemy(a, true, true); g.toast(`与${d.name}切磋，点到为止。`); return null;
    } });
    if (g.rel) opts.push(...g.rel.talkOpts(a, title, () => this.mainNode(a)));
    opts.push({ label: '出手抢夺', tone: 'bad', act: () => ({ speaker: '心念', text: d.faction === 'demon' || this.hostileTo(d) ? `${d.name}身上魔气隐隐，除之也不算坏事。` : `${d.name}并无恶意。若无故出手，传扬出去必然声名狼藉，其同门也会记恨于你。`, options: [{ label: '动手！', tone: 'bad', act: () => { this.toEnemy(a, true); a.bubble = { text: '你——找死！', t: 3 }; return null; } }, { label: '算了', act: () => this.mainNode(a) }] }) });
    opts.push({ label: '告辞', act: () => null });
    return { speaker: d.name, title, look: a.look, text: modx?.greet(d.id) ?? this.greeting(d), options: opts, chat: { kind: 'npc', id: d.id } };
  }
  private teach(a: Active, title: string): DNode {
    const g = this.game, d = a.d; d.taught = true;
    const sk = d.realm >= g.hero.realm && Math.random() < 0.5 ? g.combat.randomScroll(Math.min(4, d.realm)) : null;
    if (sk) { C.addItem(g.hero, sk, 1); return { speaker: d.name, title, look: a.look, text: `（${d.name}沉吟片刻，从储物袋中取出一枚玉简）这门法术我早已用不上了，送你吧。\n\n获得 ${itemDef(sk).name}（在储物袋中研读参悟）`, options: [{ label: '多谢道友！', act: () => null }] }; }
    const msgs: C.Msg[] = []; const exp = C.need(g.hero) * C.INSIGHT * 0.06; C.gainExp(g.hero, exp, msgs);
    return { speaker: d.name, title, look: a.look, text: `（${d.name}与你论道半日，讲了些${d.realm > g.hero.realm ? REALMS[g.hero.realm + 1]?.name ?? '' : '运功'}的关窍）\n\n你有所领悟，修为 +${Math.round(exp)}`, options: [{ label: '受教了', act: () => null }] };
  }
  private giftNode(a: Active, title: string): DNode {
    const g = this.game, d = a.d, h = g.hero;
    const curId = worldCurrencyId(ACTIVE_WORLD), curName = worldCurrencyName(ACTIVE_WORLD);
    const amt = ACTIVE_WORLD === 'human'
      ? Math.max(10, 10 * Math.pow(3, Math.min(4, d.realm)))
      : ACTIVE_WORLD === 'spirit' ? Math.max(2, d.realm * 3) : Math.max(2, d.realm * 2);
    const pills = h.bag.filter((b) => itemDef(b.id).type === 'pill').slice(0, 4);
    const give = (gain: number, line: string) => {
      if (d.grudge >= 2) { gain = Math.round(gain * 0.25); line = '（对方看也不看，随手收下）……这点东西，换不回一条命。'; }
      d.favor = clamp(d.favor + gain, -100, 100);
      if (d.grudge === 1 && d.favor > 0) { d.grudge = 0; d.why = undefined; d.hunting = false; }
      if (d.grudge >= 2 && d.favor > -20) d.grudge = 1;
      return { speaker: d.name, title, look: a.look, text: line, options: [{ label: '还有别的事', act: () => this.mainNode(a) }, { label: '告辞', act: () => null }] } as DNode; };
    const opts: DOpt[] = [{ label: `赠${curName} ${amt}`, disabled: C.bagCount(h, curId) < amt, act: () => { C.removeItem(h, curId, amt); return give(d.pers === 'greedy' ? 16 : d.pers === 'aloof' ? 3 : 8, d.pers === 'greedy' ? '（对方眼睛一亮，飞快收下）道友真是爽快人！' : d.pers === 'aloof' ? '……身外之物罢了。' : '无功不受禄……那便多谢道友了。'); } }];
    for (const b of pills) { const it = itemDef(b.id); opts.push({ label: `赠${it.name}`, act: () => { C.removeItem(h, b.id, 1); return give(6 + it.tier * 6, `${it.name}？道友有心了！`); } }); }
    opts.push({ label: '算了', act: () => this.mainNode(a) });
    return { speaker: d.name, title, look: a.look, text: '（你想送些什么？）', options: opts };
  }
  private stock(d: NpcData): ShopStock[] {
    const month = Math.floor(this.game.day / 30);
    const map = (this.game.ws.shopCache ??= {});
    const prefix = `npc:${d.id}@`;
    const key = `${prefix}${month}`;
    for (const k of Object.keys(map)) if (k.startsWith(prefix) && k !== key) delete map[k];
    if (Array.isArray(map[key])) return map[key];
    let s = d.seed + month;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    // 第三十七步：散修 / 行商的货也按产地——摆摊的只有村镇坊市那一档，行商能多一档
    const z = zoneOfLoc(LOC_BY_ID.get(d.home)), lvl = d.faction === 'merchant' ? 2 : 1, yCap = yaodanCap(pzOf(z), lvl, rnd);
    const pool = ITEM_LIST.filter((it) => it.tier <= Math.max(1, d.realm + (d.faction === 'merchant' ? 1 : 0)) && it.type !== 'misc' && sellableAt(it, z, lvl, yCap));
    const out: ShopStock[] = [];
    const n = 4 + Math.floor(rnd() * 5);
    const mul = d.pers === 'greedy' ? 1.4 : d.pers === 'kind' ? 0.9 : 1.1;
    for (let i = 0; i < n && pool.length; i++) { const it = pool[Math.floor(rnd() * pool.length)]; if (out.some((o) => o.id === it.id)) continue; out.push({ id: it.id, price: Math.max(1, Math.round(it.price * priceMul(it, z) * mul * (1 - clamp(d.favor, 0, 60) / 300))), n: it.type === 'artifact' || it.type === 'scroll' ? 1 : 1 + Math.floor(rnd() * 5), age: it.type === 'herb' ? 10 + Math.floor(rnd() * 60) : undefined, seller: d.id, sellerName: d.name }); }
    this.game.renxin?.injectStallFakes(d, out);
    map[key] = out;
    return out;
  }
  rumor(d: NpcData): string {
    { const jl = this.game.jianghu?.rumorLine(d); if (jl) return jl; }   // 江湖篇：消息对象（可能是饵、是借刀之信）
    { const lr = this.game.living?.rumorFor(d); if (lr && Math.random() < 0.6) return lr; }   // 第四十三步：活世界里真发生过的事
    const g = this.game;
    // 大事件传闻优先
    const ev = g.events?.rumorFor(d);
    if (ev && Math.random() < 0.6) return ev;
    // 指点附近的洞府 / 险地（揭开地图）
    const p = g.player;
    const near = LOCATIONS.filter((l) => (l.type === 'secret' || l.type === 'danger') && Math.hypot(l.x * WORLD_SCALE - p.x, l.y * WORLD_SCALE - p.y) < 22000 && !g.isExplored(l.x * WORLD_SCALE, l.y * WORLD_SCALE));
    if (near.length && Math.random() < 0.55) {
      const l = near[Math.floor(Math.random() * near.length)];
      g.markKnown(l);
      const dir = this.dirName(l.x * WORLD_SCALE - p.x, l.y * WORLD_SCALE - p.y);
      return l.type === 'secret' ? `往${dir}去，有一处「${l.name}」，据说是前人留下的洞府，禁制还在。有本事的不妨去碰碰运气。\n\n（地图上已标出${l.name}）` : `${dir}边的「${l.name}」妖兽横行，${l.danger! >= 3 ? '连筑基修士都折了好几个' : '不过妖丹倒是值几个钱'}。\n\n（地图上已标出${l.name}）`;
    }
    const L = [
      '坊市的筑基丹又涨价了，一枚少说也要上千灵石。',
      '听说有人在山里看到灵光冲天，怕是有天材地宝出世。',
      '最近劫修猖獗，独行的修士可要小心。',
      '掌门师叔说，过几年各派又要联手开启禁地了。',
      '有个散修在城外摆摊卖“上古功法”，十有八九是骗子。',
      '沧溟海那边的妖丹，比南荒便宜一半。',
      '我那师兄闭关三十年没出来，怕是坐化了。',
      '修仙界有句话：遇事不决，先跑为上。',
      '若神识被比你强的人扫中，要么敛息藏好，要么赶紧走。',
      d.faction === 'mortal' ? '仙人的事俺不懂，只知道去年山里有条大蛇吃了三头牛。' : '灵根不好也莫灰心，丹药堆上去，一样能筑基。',
    ];
    return L[Math.floor(Math.random() * L.length)];
  }
  dirName(dx: number, dy: number) { const a = Math.atan2(dy, dx); const i = Math.round(a / (Math.PI / 4)); return ['东', '东南', '南', '西南', '西', '西北', '北', '东北'][(i + 8) % 8]; }

  private static readonly PROP_LIFE = new Set(['fish', 'stall', 'sweep', 'carry', 'wash', 'chop', 'flute', 'paint', 'tea', 'chess', 'drunk', 'tell', 'herb', 'pray']);

  // ------------------------------------------------------------ 绘制
  collect(out: { y: number; x?: number; minX?: number; maxX?: number; minY?: number; draw: (g: G) => void; gl?: (batch: any, occA: number) => boolean }[], view: { left: number; top: number; right: number; bottom: number }, t: number, dt: number) {
    const g = this.game;
    const z = g.cam?.zoom ?? 1;
    const dpr = g.renderer?.dpr ?? 1;
    const ren = g.renderer as { pushAtlasSpr?: (...args: any[]) => boolean } | undefined;
    for (const a of this.active.values()) {
      if (a.enemy) continue;
      const st = a.st, d = a.d;
      if (st.x < view.left - 200 || st.x > view.right + 200 || st.y < view.top - 100 || st.y > view.bottom + 420) continue;
      const v = g.life.vis({ x: st.x, y: st.y });
      if (v <= 0.01) continue;
      const S = 1.12;
      const hScale = S * (a.look.height || 1);
      const screenH = 150 * hScale * z * dpr;
      const isSpecial = !!(d.beauty || d.canon || this.focus === a);
      const hasPropLife = !!(a.life && a.wait > 0 && NpcWorld.PROP_LIFE.has(a.life.k));
      const isFlying = st.action === 'fly' || st.lift > 12;
      const eligible = !a.bolts.length && !hasPropLife && !a.sup && !a.duel && !a.bubble && this.focus !== a && !hasBeastSprite('n:' + d.id) && !(g.shen as any)?.allyY?.has?.(d.id);
      const farDotEligible = !a.bolts.length && !a.sup && !a.duel && this.focus !== a && !hasBeastSprite('n:' + d.id) && !(g.shen as any)?.allyY?.has?.(d.id);
      const maxH = (isSpecial || isFlying) ? 125 : 185;
      let gl: ((batch: any, occA: number) => boolean) | undefined;
      if (farDotEligible && ren?.pushAtlasSpr && screenH < 12) {
        if (!charFrames.takeDot(!!d.beauty || isSpecial)) continue;
        const [cr, cg, cb] = d.beauty ? [1, 0.78, 0.85] : d.faction === 'demon' ? [0.88, 0.36, 0.36] : d.realm === 0 ? [0.91, 0.88, 0.80] : [0.68, 0.88, 0.72];
        const ds = 0.5 / Math.max(0.02, z);
        gl = (batch, occA) => ren.pushAtlasSpr!(batch, getDotSprite(), st.x, st.y - 6 * S - st.lift, ds, ds, false, v * occA, 'P2:dot8', cr, cg, cb);
      } else if (eligible && ren?.pushAtlasSpr && screenH <= maxH) {
        gl = (batch, occA) => {
          const sc = hScale / CHAR_FRAME_SCALE;
          const shA = st.lift > 0 ? Math.max(0.22, 1 - st.lift / 320) : 1;
          const shSx = 1.15 * (1 + st.lift * 0.004);
          const okSh = ren.pushAtlasSpr!(batch, getShadowSprite(), st.x, st.y + 2, shSx, 1.15, false, v * occA * shA, 'P2:shadow32');
          if (!okSh) return false;
          if (isSpecial || isFlying) {
            const f = charFrames.get(a.look, st);
            if (!f || !ren.pushAtlasSpr!(batch, f, st.x, st.y - st.lift, sc, sc, false, v * occA, f.key)) return false;
          } else {
            const body = charFrames.getBody(a.look, st);
            const head = charFrames.getHead(a.look, st);
            if (!body || !head) return false;
            if (!ren.pushAtlasSpr!(batch, body, st.x, st.y, sc, sc, false, v * occA, body.key)) return false;
            if (!ren.pushAtlasSpr!(batch, head, st.x + body.hx * hScale, st.y + body.hy * hScale, sc, sc, false, v * occA, head.key)) return false;
          }
          const important = d.beauty || a.duel || a.act === 'approach';
          if (guidanceInfoVisible(g, '修士', 'npc', a) && (important || (v > 0.05 && screenH > 12 && (this.labelSet.size === 0 || this.labelSet.has(d.id))))) {
            const gap = this.power(d) - this.playerLv();
            const col = d.realm === 0 ? '#e8e0cc' : gap > 6 ? '#ff7a6a' : gap > 0 ? '#ffd27a' : gap > -6 ? '#e8f0e0' : '#9fc8a0';
            const label = this.formatNpcLabel(d);
            const fsQ = Math.round(Math.min(16, Math.max(11, 13 / Math.max(0.5, z))));
            const col2 = d.beauty ? '#ffc8d8' : col;
            const res = Math.min(4, Math.max(2, Math.ceil(z * dpr * 1.2)));
            const spr = labelSprite(label, fsQ, col2, res);
            const ly = st.y - 150 * hScale - st.lift - fsQ * 0.27;
            ren.pushAtlasSpr!(batch, { canvas: spr, w: spr.width, h: spr.height, ax: spr.width / 2, ay: spr.height / 2 }, st.x, ly, 1 / res, 1 / res, false, v * occA);
          }
          return true;
        };
      }
      out.push({
        y: isFlying ? st.y + 200000 : st.y,
        x: st.x, minX: st.x - 60, maxX: st.x + 60, minY: st.y - st.lift - 180 * hScale,
        gl, draw: (ctx) => this.drawOne(ctx, a, v, t, dt),
      });   // 御器飞行时在山树之上
    }
  }
  private drawRod(ctx: G, a: Active, t: number) {
    const st = a.st, L = a.life!, c = Math.cos(L.dir), s = Math.sin(L.dir);
    const bx = st.x + c * 16, by = st.y - 40 + s * 6;
    const tx = st.x + c * 128, ty = st.y - 108 + s * 46;
    const fx = st.x + c * 190, fy = st.y + s * 120 + Math.sin(t * 2.2 + a.d.seed) * 1.6;
    ctx.save(); ctx.lineCap = 'round';
    // 涟漪
    const rip = ((t + a.d.seed * 0.37) % 2.6) / 2.6, bite = L.li && t - L.li < 1.2;
    ctx.strokeStyle = `rgba(240,248,255,${0.5 * (1 - rip)})`; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.ellipse(fx, fy + 2, 6 + rip * 26, (6 + rip * 26) * 0.35, 0, 0, TAU); ctx.stroke();
    // 钓竿
    ctx.strokeStyle = '#4a3420'; ctx.lineWidth = 3.2; ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo((bx + tx) / 2, (by + ty) / 2 - 8, tx, ty); ctx.stroke();
    ctx.strokeStyle = '#7a5a34'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo((bx * 2 + tx) / 3, (by * 2 + ty) / 3 - 3); ctx.quadraticCurveTo((bx + tx) / 2, (by + ty) / 2 - 8, tx, ty); ctx.stroke();
    // 钓线
    ctx.strokeStyle = 'rgba(235,235,225,0.75)'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.quadraticCurveTo(tx + c * 30, (ty + fy) / 2 + 20, fx, fy - (bite ? 0 : 3)); ctx.stroke();
    // 浮漂
    const dy = bite ? 4 + Math.sin(t * 20) * 2 : 0;
    ctx.fillStyle = '#c8402a'; ctx.beginPath(); ctx.ellipse(fx, fy - 4 + dy, 2.6, 4.2, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#f4efe2'; ctx.beginPath(); ctx.ellipse(fx, fy - 1 + dy, 2.6, 2, 0, 0, TAU); ctx.fill();
    // 鱼篓
    ctx.fillStyle = '#8a6a3a'; ctx.strokeStyle = '#5a4020'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(st.x - c * 34 + 18, st.y + 8, 11, 6, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(st.x - c * 34 + 8, st.y + 8); ctx.quadraticCurveTo(st.x - c * 34 + 18, st.y - 18, st.x - c * 34 + 28, st.y + 8); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  private drawStall(ctx: G, a: Active) {
    const st = a.st, L = a.life!, x = st.x, y = st.y + 34, w = 118, h = 36, sk = 10;
    ctx.save();
    // 布摊
    ctx.fillStyle = 'rgba(30,24,16,0.22)'; ctx.beginPath(); ctx.ellipse(x, y + h / 2 + 4, w * 0.6, 8, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = ['#6a3a2c', '#3a4a5c', '#4a5a36', '#5a4a3a', '#7a5a3a'][L.ware ?? 4];
    ctx.beginPath(); ctx.moveTo(x - w / 2 + sk, y - h / 2); ctx.lineTo(x + w / 2 + sk, y - h / 2); ctx.lineTo(x + w / 2 - sk, y + h / 2); ctx.lineTo(x - w / 2 - sk, y + h / 2); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(240,220,170,0.55)'; ctx.lineWidth = 1.4; ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(x - w / 2 + sk + 4, y - h / 2 + 4); ctx.lineTo(x + w / 2 + sk - 4, y - h / 2 + 4); ctx.lineTo(x + w / 2 - sk - 4, y + h / 2 - 4); ctx.lineTo(x - w / 2 - sk + 4, y + h / 2 - 4); ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
    // 货品
    const seed = a.d.seed;
    for (let i = 0; i < 5; i++) {
      const gx = x - 44 + i * 22 + ((seed >> i) & 3), gy = y - 4 + ((i % 2) ? 6 : -4);
      const k = L.ware ?? 4;
      if (k === 0) { ctx.fillStyle = ['#7aa898', '#c8b080', '#a86a4a'][i % 3]; ctx.beginPath(); ctx.ellipse(gx, gy, 6, 7, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#c84a2a'; ctx.fillRect(gx - 3, gy - 10, 6, 4); }
      else if (k === 1) { ctx.fillStyle = '#e8d070'; ctx.fillRect(gx - 5, gy - 8, 10, 16); ctx.strokeStyle = '#b02a1a'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(gx, gy - 6); ctx.lineTo(gx, gy + 6); ctx.moveTo(gx - 3, gy - 2); ctx.lineTo(gx + 3, gy - 2); ctx.stroke(); }
      else if (k === 2) { ctx.fillStyle = ['#5a9a4a', '#7ab45a', '#4a7a3a'][i % 3]; for (let j = 0; j < 3; j++) { ctx.beginPath(); ctx.ellipse(gx + (j - 1) * 4, gy - 2, 3, 7, (j - 1) * 0.5, 0, TAU); ctx.fill(); } }
      else if (k === 3) { ctx.strokeStyle = '#c8d0d8'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(gx - 8, gy + 4); ctx.lineTo(gx + 8, gy - 6); ctx.stroke(); ctx.strokeStyle = '#6a4a2a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(gx - 9, gy + 5); ctx.lineTo(gx - 5, gy + 2.5); ctx.stroke(); }
      else { ctx.fillStyle = ['#c89a5a', '#e8dcc0', '#8a6a4a'][i % 3]; ctx.beginPath(); ctx.ellipse(gx, gy, 7, 4, 0, 0, TAU); ctx.fill(); }
    }
    // 幌子
    const px = x + w / 2 + 6, py = y + 4;
    ctx.strokeStyle = '#4a3420'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py - 120); ctx.stroke();
    ctx.fillStyle = '#efe4c8'; ctx.strokeStyle = 'rgba(80,50,30,0.6)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.rect(px - 22, py - 116, 20, 40); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#a8302a'; ctx.font = '15px "Noto Serif SC","Songti SC",serif'; ctx.textAlign = 'center';
    ctx.fillText(['丹', '符', '药', '器', '杂'][L.ware ?? 4], px - 12, py - 90);
    ctx.restore();
  }
  private drawOne(ctx: G, a: Active, v: number, t: number, dt: number) {
    const st = a.st, d = a.d, z = this.game.cam.zoom;
    const S = 1.12;
    const hScale = S * (a.look.height || 1);
    const screenH = 150 * hScale * z * (this.game.renderer?.dpr ?? 1);
    const isSpecial = !!(d.beauty || d.canon || this.focus === a);
    const hasPropLife = !!(a.life && a.wait > 0 && NpcWorld.PROP_LIFE.has(a.life.k));
    const isFlying = st.action === 'fly' || st.lift > 12;
    const simpleChar = !a.bolts.length && !hasPropLife && !a.sup && !a.duel && !a.bubble && this.focus !== a && !hasBeastSprite('n:' + d.id) && !(this.game.shen as any)?.allyY?.has?.(d.id);
    const farDotChar = !a.bolts.length && !a.sup && !a.duel && this.focus !== a && !hasBeastSprite('n:' + d.id) && !(this.game.shen as any)?.allyY?.has?.(d.id);
    if (farDotChar && screenH < 12) {
      ctx.save();
      ctx.globalAlpha *= v;
      ctx.fillStyle = d.beauty ? '#ffc8d8' : d.faction === 'demon' ? '#e05c5c' : d.realm === 0 ? '#e8e0cc' : '#addfa8';
      ctx.beginPath();
      ctx.arc(st.x, st.y - 6 * S - st.lift, 2 / Math.max(0.02, z), 0, TAU);
      ctx.fill();
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.globalAlpha *= v;
    // 影子
    if (screenH >= 14) {
      ctx.fillStyle = `rgba(30,30,24,${Math.max(0.1, 0.26 - Math.min(0.16, st.lift / 560))})`;
      ctx.beginPath(); ctx.ellipse(st.x, st.y + 2, 20 + st.lift * 0.2, 6 + st.lift * 0.04, 0, 0, TAU); ctx.fill();
    }
    // 斗法护体光
    if (a.duel) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= 0.25 + 0.1 * Math.sin(t * 8); ctx.fillStyle = d.faction === 'demon' ? '#ff3050' : '#80d0ff'; ctx.beginPath(); ctx.ellipse(st.x, st.y - 60 - st.lift, 36, 70, 0, 0, TAU); ctx.fill(); ctx.restore(); }
    if (a.life?.k === 'fish' && a.wait > 0) this.drawRod(ctx, a, t);
    if (a.life && a.wait > 0) drawAliveUnder(ctx, a as any, t);
    const sv = a.sup ? { lv: a.sup, on: a.supOn ?? 0, col: SUP_COL_P, seed: a.d.seed % 997 } : null;
    if (sv) { drawSupUnder(ctx, st.x, st.y, sv, t); ctx.save(); supSquash(ctx, st.x, st.y, sv, t); }
    const ys = this.game.shen?.allyScale(a, ctx);   // v0.54.2：友人元婴出窍——缩小 + 金光
    const sk = 'n:' + d.id;   // v0.56：模组给这个人换了图
    const useLayered = !isSpecial && !ys && !a.duel && !isFlying && screenH <= 185 && !hasBeastSprite(sk);
    const body = useLayered ? charFrames.getBody(a.look, st) : null;
    const head = body ? charFrames.getHead(a.look, st) : null;
    const cf = !useLayered && simpleChar && screenH <= 125 && !ys ? charFrames.get(a.look, st) : null;
    if (st.lift > 12 && !cf && !(body && head)) drawSwordUnderFeet(ctx, st.x, st.y - st.lift, st.yaw, S, t, a.look.swordColor ?? (d.faction === 'demon' ? '#ff6a7a' : '#9fe8ff'));
    if (body && head) {
      const sc = hScale / CHAR_FRAME_SCALE;
      ctx.drawImage(body.canvas, st.x - body.ax * sc, st.y - body.ay * sc, body.w * sc, body.h * sc);
      ctx.drawImage(head.canvas, st.x + body.hx * hScale - head.ax * sc, st.y + body.hy * hScale - head.ay * sc, head.w * sc, head.h * sc);
    } else if (cf) {
      const sc = hScale / CHAR_FRAME_SCALE;
      ctx.drawImage(cf.canvas, st.x - cf.ax * sc, st.y - st.lift - cf.ay * sc, cf.w * sc, cf.h * sc);
    } else if (!(hasBeastSprite(sk) && drawBeastSprite(ctx, sk, st.x, st.y, Math.sin(st.yaw) >= 0 ? 1 : -1, charAnim(st, t), S * (ys ?? 1)))) {
      drawCharacter(ctx, a.look, st, S * (ys ?? 1), dt, { detail: isSpecial ? 1 : 2.6, noDefaultMount: st.lift > 12 });
    }
    if (sv) { ctx.restore(); drawSupOver(ctx, st.x, st.y, sv, t, 120); }
    if (a.life?.k === 'stall' && a.wait > 0) this.drawStall(ctx, a);
    if (a.life && a.wait > 0) drawAliveOver(ctx, a as any, t);
    // 法术光弹
    if (a.bolts.length) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      for (const b of a.bolts) {
        const k = b.t / 0.45, hx = b.x + (b.x2 - b.x) * Math.min(1, k * 1.6), hy = b.y + (b.y2 - b.y) * Math.min(1, k * 1.6);
        ctx.strokeStyle = `rgba(${b.col},${0.8 * (1 - k)})`; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(b.x + (hx - b.x) * 0.5, b.y + (hy - b.y) * 0.5); ctx.lineTo(hx, hy); ctx.stroke();
        ctx.fillStyle = `rgba(${b.col},${1 - k})`; ctx.beginPath(); ctx.arc(hx, hy, 9, 0, TAU); ctx.fill();
        if (k > 0.6) { ctx.globalAlpha = (1 - k) * 2; ctx.beginPath(); ctx.arc(b.x2, b.y2, 26 * k, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
      }
      ctx.restore();
    }
    // 名牌（神识内圈可见即全显；借缓存小图 blit 保帧率）
    const important = d.beauty || a.duel || a.act === 'approach' || this.focus === a;
    if ((this.focus === a || guidanceInfoVisible(this.game, '修士', 'npc', a)) && (important || (v > 0.05 && screenH > 12 && (this.labelSet.size === 0 || this.labelSet.has(d.id))))) {
      const gap = this.power(d) - this.playerLv();
      const col = d.realm === 0 ? '#e8e0cc' : gap > 6 ? '#ff7a6a' : gap > 0 ? '#ffd27a' : gap > -6 ? '#e8f0e0' : '#9fc8a0';
      const y = st.y - 150 * hScale - st.lift;
      const label = this.formatNpcLabel(d);
      // 字号量化到整数像素 + 封顶 16，再烘成小图：每帧只 blit，不再重排字形
      const fsQ = Math.round(Math.min(16, Math.max(11, 13 / Math.max(0.5, z))));
      const col2 = d.beauty ? '#ffc8d8' : col;
      const res = Math.min(4, Math.max(2, Math.ceil(z * (this.game.renderer?.dpr ?? 1) * 1.2)));
      const spr = labelSprite(label, fsQ, col2, res);
      const sw = spr.width / res, sh = spr.height / res;
      ctx.drawImage(spr, st.x - sw / 2, y - fsQ * 0.27 - sh / 2, sw, sh);
      if (this.focus === a) {
        const fs = Math.max(11, 13 / Math.max(0.5, z));
        ctx.font = `${fs * 0.85}px "Noto Serif SC",serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255,240,200,0.95)';
        ctx.fillText('【T】交谈', st.x, y - fs * 1.2);
      }
    }
    // 气泡绘制节流：一帧最多 5 个，位置挨太近的只画一个；远景缩略下不画气泡
    let bubbleOK = false;
    if (a.bubble && z >= 0.2) {
      const by = st.y - 175 * hScale - st.lift;
      if (this.bubFrame !== this.game.frameNo) { this.bubFrame = this.game.frameNo; this.bubDrawn.length = 0; }
      bubbleOK = this.bubDrawn.length < 5 && !this.bubDrawn.some((b) => Math.abs(b.x - st.x) < 160 && Math.abs(b.y - by) < 130);
      if (bubbleOK) this.bubDrawn.push({ x: st.x, y: by });
    }
    if (bubbleOK && a.bubble?.mind) {
      const fs = Math.max(11, 12.5 / Math.max(0.5, z));
      drawMindBubble(ctx, st.x, st.y - 175 * hScale - st.lift - fs * 0.6, a.bubble.text, fs, Math.min(1, a.bubble.t * 1.5), !!a.bubble.gold, !!a.bubble.crack);
    } else if (bubbleOK && a.bubble) {
      const fs = Math.max(12, 14 / Math.max(0.5, z));
      ctx.font = `${fs}px "Noto Serif SC","Songti SC",serif`; ctx.textAlign = 'center';
      const w = ctx.measureText(a.bubble.text).width + fs, y = st.y - 175 * hScale - st.lift - fs;
      ctx.globalAlpha *= Math.min(1, a.bubble.t * 2);
      ctx.fillStyle = 'rgba(250,244,228,0.92)'; ctx.strokeStyle = 'rgba(60,40,30,0.6)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); (ctx as any).roundRect ? (ctx as any).roundRect(st.x - w / 2, y - fs * 0.95, w, fs * 1.5, fs * 0.5) : ctx.rect(st.x - w / 2, y - fs * 0.95, w, fs * 1.5); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#2a2018'; ctx.fillText(a.bubble.text, st.x, y + fs * 0.1);
    }
    ctx.restore();
  }
  /** 小地图 / 世界地图：神识范围内的人 */
  visibleDots() { const g = this.game; const out: { x: number; y: number; c: string }[] = []; for (const a of this.active.values()) if (!a.enemy && g.life.vis({ x: a.st.x, y: a.st.y }) > 0.3) out.push({ x: a.st.x, y: a.st.y, c: a.d.beauty ? '#ff9ac0' : this.hostileTo(a.d) ? '#ff6a5a' : '#e8e0cc' }); return out; }
  activeOf(id: string) { return this.active.get(id) ?? null; }
  /** 第二十九步：随行者（可替你挡刀） */
  followers() { const out: Active[] = []; for (const a of this.active.values()) if (a.act === 'follow' && !a.enemy && a.d.alive) out.push(a); return out; }
  /** 让某人出现在玩家身旁（同行；下界低阶修士不得无视界壁跨入更高界域） */
  summon(id: string) {
    const d = this.byId.get(id); if (!d) return null;
    const wCur = worldOfMap(ACTIVE_MAP), wNpc = worldOfMap(npcMap(d));
    if (wCur === 'spirit' && wNpc === 'human' && d.realm < 4) {
      this.game.toast(`${d.name}尚未突破至元婴期以上或未获接引洗髓，无法承受灵界天威随行。`, 'warn');
      return null;
    }
    if (wCur === 'immortal' && wNpc !== 'immortal' && d.realm < 8) {
      this.game.toast(`${d.name}尚未渡过飞升仙劫，无法直接随行进入仙界。`, 'warn');
      return null;
    }
    const p = this.game.player;
    d.x = p.x - 80; d.y = p.y + 30; d.map = ACTIVE_MAP;
    let a = this.active.get(id);
    if (!a) { a = { d, st: new CharState(d.x, d.y), look: this.look(d), act: 'follow', castT: 0, t: 0, wait: 0, noticed: 0, hp: 1, bolts: [], allyCd: 1 }; this.active.set(id, a); }
    a.st.x = d.x; a.st.y = d.y; a.act = 'follow'; a.duel = undefined; a.enemy = undefined;
    return a;
  }
  dismiss(id: string) {
    const d = this.byId.get(id);
    if (d) {
      d.helpUntil = undefined;
      d.helpUntilDay = undefined;
      delete (d as any).waitAt;
      if (d.bond === 'companion' || d.bond === 'guard') { d.bond = undefined; d.bondUntil = undefined; }
    }
    const a = this.active.get(id); if (!a) return;
    // 在异乡分别：就近找一处同界域城镇安顿下来
    if (LOC_BY_ID.get(a.d.home)?.map !== npcMap(a.d)) {
      const m = npcMap(a.d);
      let best: LocDef | null = null, bd = 1e18;
      for (const l of LOCATIONS) if ((l.map ?? 'renjie') === m && (l.type === 'city' || l.type === 'town' || l.type === 'isle' || l.type === 'sect')) { const dd = Math.hypot(l.x * WORLD_SCALE - a.d.x, l.y * WORLD_SCALE - a.d.y); if (dd < bd) { bd = dd; best = l; } }
      if (best) a.d.home = best.id;
    }
    a.act = 'idle';
    if (this.game.mijing?.active) { this.active.delete(id); return; }
    this.pickTarget(a.d);
  }
}
