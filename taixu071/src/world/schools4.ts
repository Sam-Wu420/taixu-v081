// v0.70「天阶神通」：元婴修士不再只是血厚的结丹——各派两门天阶神通（元婴起）、一门地阶秘术（结丹起），
// 散修九系各一门天阶神通。由 schools.ts 并入各派招式表（[最低境界, 招式]）。
// 天阶神通的共同点：预警久、范围大、躲得开，挨上一下极痛；问道残卷观招也以这一档最难（见 world/canjuan.ts）。
import type { FoeSkill, SkKind, El } from './foeskills';
import type { StatusSpec } from '../data/arts';

type Entry = [number, FoeSkill];
type O = Partial<FoeSkill>;
const S = (o: O & { id: string; name: string; k: SkKind }, el: El): FoeSkill => ({ el, cd: 14, tele: 1.1, pow: 2.6, range: 760, ...o } as FoeSkill);
const ST: Record<string, StatusSpec> = {
  burn: { k: 'burn', dur: 4, ch: 0.6 }, slow: { k: 'slow', dur: 3, ch: 0.7 }, freeze: { k: 'freeze', dur: 1.4, ch: 0.55 }, shock: { k: 'shock', dur: 1, ch: 0.5 },
  poison: { k: 'poison', dur: 6, ch: 0.8 }, root: { k: 'root', dur: 1.6, ch: 0.85 }, stun: { k: 'stun', dur: 0.8, ch: 0.55 }, break: { k: 'break', dur: 5, ch: 0.6 }, knock: { k: 'knock', dur: 0.35, ch: 0.85 },
};
const EL_ST: Partial<Record<El, StatusSpec>> = { fire: ST.burn, ice: ST.freeze, water: ST.slow, thunder: ST.shock, poison: ST.poison, blood: ST.break, ghost: ST.stun, wind: ST.knock, earth: ST.root, sword: ST.break, gold: ST.stun, metal: ST.break };

// ---------------------------------------------------------------- 天阶式样（o 里可覆盖）
type Make = (id: string, name: string, el: El, o?: O) => FoeSkill;
const T: Record<string, Make> = {
  /** 漫天落击 */
  rain: (id, name, el, o = {}) => S({ id, name, k: 'rain', n: 16, r: 105, tele: 1.3, pow: 2.5, cd: 16, status: EL_ST[el], ...o }, el),
  /** 贯天光柱 */
  beam: (id, name, el, o = {}) => S({ id, name, k: 'beam', len: 920, w: 150, tele: 1.2, dur: 0.6, pow: 3.4, range: 880, min: 100, cd: 15, status: EL_ST[el], ...o }, el),
  /** 周身大爆 */
  nova: (id, name, el, o = {}) => S({ id, name, k: 'nova', r: 320, tele: 1.25, pow: 3.0, range: 280, cd: 14, status: EL_ST[el], ...o }, el),
  /** 七道齐发 */
  lines: (id, name, el, o = {}) => S({ id, name, k: 'lines', n: 7, spread: 1.5, len: 860, w: 60, tele: 1.0, dur: 0.32, pow: 2.3, range: 800, min: 160, cd: 13, ...o }, el),
  /** 六臂弹幕 */
  spiral: (id, name, el, o = {}) => S({ id, name, k: 'spiral', n: 6, waves: 14, gapT: 0.09, spread: 0.4, tele: 0.8, pow: 0.8, range: 720, cd: 15, ...o }, el),
  /** 十连爆 */
  march: (id, name, el, o = {}) => S({ id, name, k: 'march', n: 10, r: 115, tele: 0.9, gapT: 0.12, pow: 2.1, range: 860, min: 90, cd: 14, status: EL_ST[el], ...o }, el),
  /** 六连追击 */
  track: (id, name, el, o = {}) => S({ id, name, k: 'track', waves: 6, r: 120, tele: 0.9, gapT: 0.45, pow: 1.9, range: 880, cd: 14, ...o }, el),
  /** 领域：一大片区域持续生效，人在里面减速、掉血 */
  domain: (id, name, el, o = {}) => S({ id, name, k: 'circle', r: 300, tele: 1.2, pow: 1.3, range: 760, cd: 22, pool: 6, status: EL_ST[el] ?? ST.slow, ...o }, el),
  /** 隔空吸取 */
  siphon: (id, name, el, o = {}) => S({ id, name, k: 'circle', r: 200, tele: 1.0, pow: 2.4, range: 760, cd: 14, leech: 0.1, ...o }, el),
  /** 摄引长索 */
  hook: (id, name, el, o = {}) => S({ id, name, k: 'beam', len: 860, w: 70, tele: 0.8, dur: 0.3, pow: 2.2, range: 820, min: 200, cd: 13, pull: 330, ...o }, el),
  /** 地阶：中等的落点重击 */
  circle: (id, name, el, o = {}) => S({ id, name, k: 'circle', r: 170, tele: 0.95, pow: 2.3, range: 640, cd: 11, status: EL_ST[el], ...o }, el),
  /** 地阶：五道齐发 */
  lines5: (id, name, el, o = {}) => S({ id, name, k: 'lines', n: 5, spread: 1.0, len: 700, w: 52, tele: 0.8, dur: 0.3, pow: 1.9, range: 660, min: 160, cd: 11, ...o }, el),
  /** 地阶：四连追击 */
  track4: (id, name, el, o = {}) => S({ id, name, k: 'track', waves: 4, r: 100, tele: 0.8, gapT: 0.5, pow: 1.7, range: 700, cd: 11, ...o }, el),
  /** 地阶：七连爆 */
  march7: (id, name, el, o = {}) => S({ id, name, k: 'march', n: 7, r: 95, tele: 0.75, gapT: 0.13, pow: 1.8, range: 680, min: 90, cd: 11, ...o }, el),
  /** 地阶：四臂弹幕 */
  spiral4: (id, name, el, o = {}) => S({ id, name, k: 'spiral', n: 4, waves: 11, gapT: 0.1, spread: 0.42, tele: 0.6, pow: 0.7, range: 600, cd: 12, ...o }, el),
};

/** [流派 id, 天阶一（式样, 名）, 天阶二, 地阶（结丹起）]；五行默认用该派本系，个别式另指 */
type Row = [string, [string, string, El?], [string, string, El?], [string, string, El?]];
const ROWS: Row[] = [
  // ---- 梁国七派及附近
  ['huangfeng', ['rain', '青霄万剑归宗'], ['beam', '霞光贯日剑'], ['lines5', '五行剑气']],
  ['qixuan', ['nova', '玄铁崩山劲', 'earth'], ['march', '连环裂地掌', 'earth'], ['track4', '追风夺命镖', 'metal']],
  ['yanyue', ['domain', '凝霜冰封领域'], ['lines', '寒月七轮斩'], ['circle', '霜天坠玉']],
  ['lingshou', ['spiral', '万蛊噬天'], ['hook', '兽王摄魂索', 'phys'], ['march7', '百兽奔腾', 'phys']],
  ['qingxu', ['rain', '九霄神雷'], ['beam', '清微天罡雷'], ['track4', '掌心五雷']],
  ['huadao', ['lines', '断刀七绝斩'], ['march', '刀山火海', 'fire'], ['lines5', '五虎断魂刀']],
  ['tianque', ['domain', '天枢镇岳领域'], ['nova', '地脉崩天'], ['march7', '岩浆连涌', 'fire']],
  ['jujian', ['beam', '重岳开天剑'], ['march', '万钧剑势'], ['circle', '泰山压顶剑']],
  ['luoyun', ['domain', '万木枯荣领域'], ['spiral', '青藤万刃'], ['siphon', '回春夺元']],
  ['gujian', ['lines', '藏锋七绝剑'], ['rain', '万古剑冢'], ['track4', '剑意随形']],
  ['baiqiao', ['march', '天工千机雷'], ['spiral', '百臂机关弩'], ['circle', '机关火龙', 'fire']],
  // ---- 魔门六宗
  ['guiling', ['domain', '万鬼噬魂领域'], ['siphon', '阴灵摄魄'], ['spiral4', '幽冥鬼火']],
  ['hehuan', ['siphon', '天欢采元大法'], ['domain', '粉红迷障', 'poison'], ['hook', '红绫缚心', 'blood']],
  ['yuling', ['spiral', '万灵附体弹', 'ghost'], ['hook', '役灵锁魂链'], ['march7', '厉魄奔袭']],
  ['tiansha', ['beam', '玄煞血河'], ['nova', '煞气冲霄'], ['siphon', '血煞吞元']],
  ['qianhuan', ['lines', '万幻七影杀'], ['track', '镜中千影'], ['spiral4', '幻光流转']],
  ['yinluo', ['domain', '尸瘴毒域'], ['march', '万尸奔涌', 'ghost'], ['siphon', '腐骨吸髓']],
  // ---- 中州
  ['tianmo', ['beam', '天魔解体大法'], ['domain', '魔焰焚天领域', 'fire'], ['siphon', '噬元魔功']],
  ['huayi', ['domain', '归意水牢领域'], ['march', '怒涛连天'], ['track4', '暗流追魂']],
  ['qianzhu', ['rain', '万竹天雷阵'], ['spiral', '竹影漫天'], ['siphon', '毒竹噬心', 'poison']],
  ['taiyi', ['beam', '太一神光'], ['nova', '太一真罡爆'], ['lines5', '太一分光剑']],
  ['xinggong', ['rain', '星陨九天'], ['hook', '星罗磁引', 'metal'], ['spiral4', '周天星轮']],
  ['jiyin', ['domain', '玄阴寒狱'], ['siphon', '玄阴摄魂', 'ghost'], ['track4', '阴火连环', 'ghost']],
  ['mulan', ['spiral', '图腾风暴'], ['domain', '黄沙漫天领域', 'earth'], ['march7', '沙暴连卷', 'earth']],
  ['nixing', ['nova', '叛星血爆'], ['lines', '逆星七刃'], ['siphon', '噬血魔功']],
  ['miaoyin', ['domain', '天籁清音领域'], ['spiral', '十面音杀'], ['hook', '摄魂魔音']],
  ['jiexiu', ['march', '雷火连环阵', 'fire'], ['hook', '缚灵长索'], ['track4', '追魂毒砂', 'poison']],
  // ---- v0.60 新宗门
  ['haoran', ['beam', '浩然正气'], ['lines', '春秋七笔'], ['track4', '字字诛心']],
  ['taizhen', ['rain', '两仪神雷'], ['domain', '太真雷域'], ['spiral4', '两仪旋光']],
  ['tianxingzong', ['domain', '天罡地煞阵'], ['rain', '星斗坠地'], ['march7', '阵爆连环']],
  ['tianfu', ['rain', '万符天降'], ['spiral', '风火符轮阵'], ['track4', '连环雷符', 'thunder']],
  ['moyan', ['domain', '魔焰焚城'], ['beam', '魔焰贯日'], ['march7', '魔焰连爆']],
  ['xuesha', ['siphon', '血煞化元大法'], ['nova', '血海翻天'], ['lines5', '血刃五分']],
  ['wanfa', ['rain', '五行轮转大阵', 'gold'], ['lines', '万法七象'], ['march7', '五行连爆', 'fire']],
  ['liulian', ['hook', '六合锁天链'], ['spiral', '六合飞梭阵'], ['track4', '连环捕网']],
  ['leiyin', ['nova', '大日金刚'], ['beam', '佛光普照'], ['march7', '伏魔连杖']],
  ['tianshi', ['rain', '五雷天罚'], ['hook', '拘魂天索', 'ghost'], ['lines5', '天师符剑']],
  ['motuo', ['domain', '魔陀梵音领域'], ['siphon', '噬魂魔印'], ['spiral4', '魔音旋轮']],
  ['dusheng', ['domain', '万毒归宗领域'], ['spiral', '漫天毒雨'], ['siphon', '蚀元毒掌']],
  ['xiaoji', ['domain', '寒极冰域'], ['rain', '冰魄万棱'], ['lines5', '寒刃五分']],
  ['wanyao', ['nova', '万妖朝宗'], ['march', '妖血奔腾', 'blood'], ['hook', '妖王摄引']],
  ['jiuxian', ['lines', '九霄仙剑'], ['domain', '九霄彩云领域', 'wind'], ['spiral4', '玉女穿梭']],
];

export function tianKits(elOf: (sid: string) => El | undefined): Record<string, Entry[]> {
  const out: Record<string, Entry[]> = {};
  for (const [sid, a, b, c] of ROWS) {
    const base = elOf(sid) ?? 'gold';
    const mk = ([k, name, el]: [string, string, El?], i: number, realm: number): Entry => [realm, T[k](`t_${sid}_${i}`, name, el ?? base)];
    out[sid] = [mk(a, 1, 4), mk(b, 2, 4), mk(c, 3, 3)];
  }
  return out;
}

/** 散修：九系各一门天阶神通（元婴起） */
export const T_ELEM: Record<string, Entry[]> = {
  fire: [[4, T.rain('t_e_fire', '焚天火雨', 'fire')]],
  ice: [[4, T.domain('t_e_ice', '万里冰封', 'ice')]],
  thunder: [[4, T.track('t_e_thunder', '九天雷罚', 'thunder')]],
  wind: [[4, T.spiral('t_e_wind', '罡风千刃', 'wind')]],
  earth: [[4, T.nova('t_e_earth', '地裂山崩', 'earth')]],
  sword: [[4, T.lines('t_e_sword', '七星剑阵', 'sword')]],
  water: [[4, T.march('t_e_water', '沧海横流', 'water')]],
  wood: [[4, T.siphon('t_e_wood', '万木回春夺元', 'poison')]],
  metal: [[4, T.beam('t_e_metal', '庚金裂空', 'metal')]],
};

/** 元婴的第二阶段：血过半，元婴燃魂——一段时间内出手更重、出招更勤 */
export const YY_FURY: FoeSkill = S({ id: 'yy_fury', name: '元婴燃魂', k: 'fury', tele: 0.6, pow: 1.35, dur: 12, range: 900, cd: 60, hpBelow: 0.5, once: true }, 'gold');
