// v0.64「各有绝活」：各派修士与散修、劫修新添的招式——由 schools.ts 并入各派的招式表（[最低境界, 招式]）。
// 这一批用上了五种新的出招方式（实现在 foeskills.ts）：
//   lines   数道光柱扇形齐出（一轮至多中一道）
//   march   一路炸过去：自身前起逐个向你推进（一轮至多中一记）
//   track   连环追击：每隔半息，在你此刻的落脚处再落一记——站着不动会连吃几下
//   spiral  旋转弹幕：数臂弹幕边转边射
//   fury    燃血 / 狂化：一段时间内出手更重、出招更勤
// 以及两种附带效果：leech 吸取（命中后按他自身气血上限回补）、pull 摄引（把你拖向他；负数为震退）。
import type { FoeSkill, SkKind, El } from './foeskills';
import type { StatusSpec } from '../data/arts';

type Entry = [number, FoeSkill];
type O = Partial<FoeSkill>;
const S = (o: O & { id: string; name: string; k: SkKind }, el: El): FoeSkill => ({ el, cd: 7, tele: 0.8, pow: 1.8, range: 520, ...o } as FoeSkill);
const ST: Record<string, StatusSpec> = {
  burn: { k: 'burn', dur: 3, ch: 0.5 }, slow: { k: 'slow', dur: 2.5, ch: 0.6 }, freeze: { k: 'freeze', dur: 1.2, ch: 0.5 }, shock: { k: 'shock', dur: 0.8, ch: 0.45 },
  poison: { k: 'poison', dur: 5, ch: 0.7 }, root: { k: 'root', dur: 1.5, ch: 0.85 }, stun: { k: 'stun', dur: 0.7, ch: 0.5 }, break: { k: 'break', dur: 4, ch: 0.5 }, knock: { k: 'knock', dur: 0.3, ch: 0.8 },
};

// ---------------------------------------------------------------- 各式的默认参数（o 里可覆盖）
const lines = (id: string, name: string, el: El, o: O = {}) => S({ id, name, k: 'lines', n: 3, spread: 0.7, len: 560, w: 44, tele: 0.65, dur: 0.28, pow: 1.5, range: 520, min: 180, cd: 9, ...o }, el);
const march = (id: string, name: string, el: El, o: O = {}) => S({ id, name, k: 'march', n: 5, r: 78, tele: 0.6, gapT: 0.13, pow: 1.6, range: 560, min: 90, cd: 9, ...o }, el);
const track = (id: string, name: string, el: El, o: O = {}) => S({ id, name, k: 'track', waves: 3, r: 88, tele: 0.8, gapT: 0.55, pow: 1.35, range: 600, cd: 10, ...o }, el);
const spiral = (id: string, name: string, el: El, o: O = {}) => S({ id, name, k: 'spiral', n: 3, waves: 9, gapT: 0.1, spread: 0.42, tele: 0.5, pow: 0.6, range: 520, cd: 10, ...o }, el);
const fury = (id: string, name: string, el: El, o: O = {}) => S({ id, name, k: 'fury', tele: 0.5, pow: 1.3, dur: 8, range: 900, cd: 28, hpBelow: 0.8, ...o }, el);
/** 近身吸取（扇形） */
const drain = (id: string, name: string, el: El, o: O = {}) => S({ id, name, k: 'cone', r: 210, spread: 0.65, tele: 0.5, pow: 1.5, range: 200, cd: 8, leech: 0.06, ...o }, el);
/** 隔空吸取（落点） */
const siphon = (id: string, name: string, el: El, o: O = {}) => S({ id, name, k: 'circle', r: 115, tele: 0.8, pow: 1.5, range: 560, cd: 10, leech: 0.07, ...o }, el);
/** 摄引：一道细索 / 长绫，命中把你拖到他跟前 */
const hook = (id: string, name: string, el: El, o: O = {}) => S({ id, name, k: 'beam', len: 580, w: 40, tele: 0.6, dur: 0.25, pow: 1.3, range: 560, min: 220, cd: 10, pull: 240, ...o }, el);
/** 震退：周身一震，把贴身的你推开 */
const repel = (id: string, name: string, el: El, o: O = {}) => S({ id, name, k: 'nova', r: 200, tele: 0.6, pow: 1.5, range: 190, cd: 9, pull: -170, ...o }, el);

/** 各派新添的招式（键 = schools.ts / schools2.ts 里的流派 id） */
export const XKITS: Record<string, Entry[]> = {
  // ---------------- 梁国七派及附近
  huangfeng: [
    [1, lines('x_huangfeng_1', '青霄三才剑', 'sword')],
    [1, S({ id: 'x_huangfeng_2', name: '流沙术', k: 'circle', r: 135, tele: 0.8, pow: 1.1, range: 540, cd: 9, status: ST.slow, pool: 3 }, 'earth')],
    [2, track('x_huangfeng_3', '追影剑', 'sword', { waves: 4, gapT: 0.45, r: 80 })],
  ],
  qixuan: [
    [0, S({ id: 'x_qixuan_1', name: '铁砂掌', k: 'cone', r: 170, spread: 0.7, tele: 0.4, pow: 1.6, range: 160, cd: 5, status: ST.knock }, 'phys')],
    [0, S({ id: 'x_qixuan_2', name: '连环飞镖', k: 'salvo', n: 2, waves: 3, spread: 0.2, tele: 0.3, pow: 0.7, range: 480, min: 100, cd: 6 }, 'metal')],
    [1, fury('x_qixuan_3', '象甲功', 'earth', { pow: 1.25 })],
  ],
  yanyue: [
    [1, lines('x_yanyue_1', '月轮斩', 'ice', { status: ST.slow })],
    [1, spiral('x_yanyue_2', '霜华飞旋', 'ice')],
    [2, siphon('x_yanyue_3', '素女摄元', 'water')],
  ],
  lingshou: [
    [1, spiral('x_lingshou_1', '毒蜂针雨', 'poison', { n: 4 })],
    [1, march('x_lingshou_2', '兽群踏阵', 'phys', { status: ST.knock })],
    [2, fury('x_lingshou_3', '兽王血沸', 'blood')],
  ],
  qingxu: [
    [1, lines('x_qingxu_1', '清风剑诀', 'wind')],
    [1, track('x_qingxu_2', '连珠掌心雷', 'thunder', { status: ST.shock })],
    [2, repel('x_qingxu_3', '罡风震', 'wind', { status: ST.slow })],
  ],
  huadao: [
    [1, lines('x_huadao_1', '三叠刀浪', 'metal', { status: ST.break })],
    [1, spiral('x_huadao_2', '回旋刀', 'metal')],
    [2, fury('x_huadao_3', '燃血刀诀', 'blood')],
  ],
  tianque: [
    [1, march('x_tianque_1', '地脉连爆', 'earth', { status: ST.stun })],
    [1, S({ id: 'x_tianque_2', name: '飞岩乱击', k: 'salvo', n: 5, waves: 1, spread: 0.6, tele: 0.4, pow: 0.8, range: 540, min: 110, cd: 5 }, 'earth')],
    [2, hook('x_tianque_3', '岩锁牵引', 'earth', { status: ST.root })],
  ],
  jujian: [
    [1, march('x_jujian_1', '重剑连劈', 'sword', { n: 4, r: 90, pow: 1.8, status: ST.knock })],
    [1, S({ id: 'x_jujian_2', name: '破军突刺', k: 'charge', len: 480, w: 80, tele: 0.5, pow: 1.9, range: 460, min: 100, cd: 6 }, 'sword')],
    [2, lines('x_jujian_3', '剑气纵横', 'sword', { n: 4, spread: 1.0 })],
  ],
  luoyun: [
    [1, spiral('x_luoyun_1', '飞叶旋刃', 'poison')],
    [1, march('x_luoyun_2', '木刺连生', 'poison', { status: ST.slow })],
    [2, hook('x_luoyun_3', '青藤摄引', 'poison')],
  ],
  gujian: [
    [1, lines('x_gujian_1', '三才剑光', 'sword')],
    [1, track('x_gujian_2', '连环追影剑', 'sword')],
    [2, fury('x_gujian_3', '剑心通明', 'sword')],
  ],
  baiqiao: [
    [1, march('x_baiqiao_1', '连环地火雷', 'fire', { status: ST.burn })],
    [1, spiral('x_baiqiao_2', '旋转机弩', 'metal', { n: 4 })],
    [2, hook('x_baiqiao_3', '牵机索', 'metal', { status: ST.stun })],
  ],
  // ---------------- 魔门六宗
  guiling: [
    [1, track('x_guiling_1', '鬼爪连抓', 'ghost', { status: ST.slow })],
    [1, drain('x_guiling_2', '噬魂鬼火', 'ghost')],
    [2, spiral('x_guiling_3', '幽魂飞旋', 'ghost', { n: 4 })],
  ],
  hehuan: [
    [1, siphon('x_hehuan_1', '采补摄元', 'poison')],
    [1, spiral('x_hehuan_2', '桃花瘴', 'poison')],
    [2, hook('x_hehuan_3', '红绫摄魂', 'blood', { status: ST.slow })],
  ],
  yuling: [
    [1, march('x_yuling_1', '厉魄连扑', 'ghost')],
    [1, siphon('x_yuling_2', '阴魂缠身', 'ghost', { status: ST.slow })],
    [2, fury('x_yuling_3', '灵兽附体', 'ghost')],
  ],
  tiansha: [
    [1, lines('x_tiansha_1', '血煞三叉', 'blood', { status: ST.break })],
    [1, drain('x_tiansha_2', '噬血术', 'blood')],
    [2, fury('x_tiansha_3', '燃血大法', 'blood', { pow: 1.35 })],
  ],
  qianhuan: [
    [1, spiral('x_qianhuan_1', '千幻旋光', 'ghost', { n: 4 })],
    [1, track('x_qianhuan_2', '幻影连杀', 'ghost')],
    [2, lines('x_qianhuan_3', '镜花水月', 'ghost', { n: 5, spread: 1.2, w: 36, pow: 1.3 })],
  ],
  yinluo: [
    [1, hook('x_yinluo_1', '尸爪摄魂', 'poison', { status: ST.poison })],
    [1, march('x_yinluo_2', '腐骨连爆', 'poison', { pool: 2.5 })],
    [2, fury('x_yinluo_3', '炼尸狂化', 'poison')],
  ],
  tianmo: [
    [1, lines('x_tianmo_1', '魔焰三叉', 'blood', { status: ST.burn })],
    [1, drain('x_tianmo_2', '噬元魔爪', 'blood')],
    [2, spiral('x_tianmo_3', '天魔乱舞', 'blood', { n: 4 })],
  ],
  // ---------------- 中州 / 沧溟海 / 朔漠
  huayi: [
    [1, march('x_huayi_1', '叠浪连击', 'water', { status: ST.knock })],
    [1, spiral('x_huayi_2', '水镜旋流', 'water')],
    [2, hook('x_huayi_3', '暗流牵引', 'water', { status: ST.slow })],
  ],
  qianzhu: [
    [1, lines('x_qianzhu_1', '竹影三叠', 'thunder')],
    [1, siphon('x_qianzhu_2', '毒虫噬体', 'poison', { status: ST.poison })],
    [2, track('x_qianzhu_3', '竹林连雷', 'thunder', { status: ST.shock })],
  ],
  taiyi: [
    [1, lines('x_taiyi_1', '太一分光', 'gold')],
    [1, track('x_taiyi_2', '金光连珠', 'gold')],
    [2, fury('x_taiyi_3', '太一真罡', 'gold')],
  ],
  xinggong: [
    [1, march('x_xinggong_1', '流星连坠', 'gold')],
    [1, spiral('x_xinggong_2', '星旋', 'gold')],
    [2, hook('x_xinggong_3', '元磁摄引', 'gold', { status: ST.stun })],
  ],
  jiyin: [
    [1, drain('x_jiyin_1', '玄阴摄魂', 'ice', { status: ST.slow })],
    [1, track('x_jiyin_2', '阴火连环', 'ghost')],
    [2, lines('x_jiyin_3', '阴都尸火', 'fire', { status: ST.burn })],
  ],
  mulan: [
    [1, spiral('x_mulan_1', '风刃旋舞', 'wind')],
    [1, march('x_mulan_2', '沙暴连卷', 'earth', { status: ST.slow })],
    [2, fury('x_mulan_3', '图腾附灵', 'wind')],
  ],
  nixing: [
    [1, spiral('x_nixing_1', '血刃旋杀', 'blood')],
    [1, march('x_nixing_2', '逆星连爆', 'blood')],
    [2, drain('x_nixing_3', '噬血魔功', 'blood')],
  ],
  miaoyin: [
    [1, track('x_miaoyin_1', '连环音爆', 'wind', { status: ST.stun })],
    [1, spiral('x_miaoyin_2', '回旋音波', 'wind')],
    [2, hook('x_miaoyin_3', '摄魂魔音', 'ghost', { status: ST.slow })],
  ],
  // ---------------- 劫修：阴招多
  jiexiu: [
    [1, S({ id: 'x_jiexiu_1', name: '撒毒砂', k: 'cone', r: 200, spread: 0.8, tele: 0.4, pow: 1.3, range: 190, cd: 6, status: ST.poison }, 'poison')],
    [1, track('x_jiexiu_2', '连环雷火弹', 'fire', { status: ST.burn })],
    [1, hook('x_jiexiu_3', '缚灵索', 'metal', { status: ST.stun })],
    [2, fury('x_jiexiu_4', '吞下狂血丹', 'blood', { once: true, cd: 40 })],
    [2, lines('x_jiexiu_5', '三叉飞刃', 'metal')],
  ],
  // ---------------- v0.60 十五宗
  haoran: [
    [1, track('x_haoran_1', '连珠字诀', 'gold')],
    [1, lines('x_haoran_2', '笔走龙蛇', 'gold')],
    [2, fury('x_haoran_3', '浩然养气', 'gold')],
  ],
  taizhen: [
    [1, march('x_taizhen_1', '一线天雷', 'thunder', { status: ST.shock })],
    [1, spiral('x_taizhen_2', '两仪旋光', 'thunder')],
    [2, hook('x_taizhen_3', '两仪牵引', 'gold')],
  ],
  tianxingzong: [
    [1, march('x_tianxingzong_1', '连环阵爆', 'earth')],
    [1, spiral('x_tianxingzong_2', '星旗旋阵', 'earth')],
    [2, S({ id: 'x_tianxingzong_3', name: '地缚阵', k: 'circle', r: 140, tele: 0.8, pow: 1.1, range: 560, cd: 10, status: ST.root, pull: 150 }, 'earth')],
  ],
  tianfu: [
    [1, track('x_tianfu_1', '连环火符', 'fire', { status: ST.burn })],
    [1, spiral('x_tianfu_2', '风火符轮', 'fire')],
    [2, lines('x_tianfu_3', '三才剑符', 'sword')],
  ],
  moyan: [
    [1, march('x_moyan_1', '魔焰连爆', 'fire', { status: ST.burn, pool: 2 })],
    [1, spiral('x_moyan_2', '幽火旋轮', 'fire')],
    [2, fury('x_moyan_3', '焚血诀', 'fire', { pow: 1.35 })],
  ],
  xuesha: [
    [1, drain('x_xuesha_1', '噬血刀', 'blood')],
    [1, lines('x_xuesha_2', '血刃三分', 'blood')],
    [2, fury('x_xuesha_3', '血煞狂功', 'blood', { pow: 1.35 })],
  ],
  wanfa: [
    [1, march('x_wanfa_1', '五行连爆', 'earth')],
    [1, spiral('x_wanfa_2', '风火轮转', 'wind')],
    [2, lines('x_wanfa_3', '三才光柱', 'water')],
  ],
  liulian: [
    [1, spiral('x_liulian_1', '回旋飞梭', 'metal')],
    [1, track('x_liulian_2', '连环捕网', 'metal', { status: ST.slow })],
    [2, hook('x_liulian_3', '锁妖链', 'metal', { status: ST.stun })],
  ],
  leiyin: [
    [1, march('x_leiyin_1', '伏魔连杖', 'gold', { status: ST.knock })],
    [1, lines('x_leiyin_2', '佛光三照', 'gold')],
    [2, fury('x_leiyin_3', '金刚怒目', 'gold')],
  ],
  tianshi: [
    [1, track('x_tianshi_1', '五雷连轰', 'thunder', { waves: 5, gapT: 0.4, r: 80, pow: 1.2, status: ST.shock })],
    [1, lines('x_tianshi_2', '符剑三分', 'thunder')],
    [2, hook('x_tianshi_3', '拘魂索', 'gold', { status: ST.stun })],
  ],
  motuo: [
    [1, spiral('x_motuo_1', '魔音旋轮', 'ghost')],
    [1, siphon('x_motuo_2', '噬魂手印', 'ghost')],
    [2, fury('x_motuo_3', '魔陀怒相', 'ghost')],
  ],
  dusheng: [
    [1, march('x_dusheng_1', '毒瘴连爆', 'poison', { pool: 3 })],
    [1, spiral('x_dusheng_2', '漫天毒砂', 'poison', { n: 4 })],
    [2, drain('x_dusheng_3', '蚀元毒功', 'poison')],
  ],
  xiaoji: [
    [1, march('x_xiaoji_1', '冰棱连生', 'ice', { status: ST.slow })],
    [1, lines('x_xiaoji_2', '寒刃三分', 'ice')],
    [2, spiral('x_xiaoji_3', '极寒旋雪', 'ice', { n: 4 })],
  ],
  wanyao: [
    [1, track('x_wanyao_1', '连环扑杀', 'phys', { status: ST.break })],
    [1, fury('x_wanyao_2', '妖血沸腾', 'blood', { pow: 1.25 })],
    [2, lines('x_wanyao_3', '裂地爪', 'earth', { n: 4, spread: 0.9 })],
  ],
  jiuxian: [
    [1, spiral('x_jiuxian_1', '玉女穿梭', 'sword')],
    [1, lines('x_jiuxian_2', '三仙剑光', 'sword')],
    [2, hook('x_jiuxian_3', '彩绫摄引', 'wind', { status: ST.slow })],
  ],
};

/** 散修：原有六系各添两招；再添水、木、金三系（每个散修仍是随机两系） */
export const X_ELEM: Record<string, Entry[]> = {
  fire: [[1, track('x_sx_fire1', '连珠火球', 'fire', { status: ST.burn })], [2, lines('x_sx_fire2', '烈焰三叉', 'fire', { status: ST.burn })]],
  ice: [[1, march('x_sx_ice1', '冰棱连生', 'ice', { status: ST.slow })], [2, spiral('x_sx_ice2', '冰晶旋舞', 'ice')]],
  thunder: [[1, track('x_sx_thunder1', '连环落雷', 'thunder', { status: ST.shock })], [2, lines('x_sx_thunder2', '三叉电弧', 'thunder')]],
  wind: [[1, spiral('x_sx_wind1', '旋风刃', 'wind')], [2, repel('x_sx_wind2', '罡风震', 'wind', { status: ST.slow })]],
  earth: [[1, march('x_sx_earth1', '地刺连突', 'earth', { status: ST.stun })], [2, S({ id: 'x_sx_earth2', name: '土牢术', k: 'circle', r: 120, tele: 0.85, pow: 1.2, range: 560, cd: 10, status: ST.root }, 'earth')]],
  sword: [[1, track('x_sx_sword1', '追影飞剑', 'sword')], [2, lines('x_sx_sword2', '三才剑气', 'sword')]],
  water: [
    [1, S({ id: 'x_sx_water0', name: '水箭术', k: 'salvo', n: 3, waves: 2, spread: 0.35, tele: 0.35, pow: 0.85, range: 580, min: 110, cd: 6, status: ST.slow }, 'water')],
    [1, march('x_sx_water1', '水浪连击', 'water', { status: ST.knock })],
    [2, S({ id: 'x_sx_water2', name: '水龙卷', k: 'circle', r: 125, tele: 0.85, pow: 1.7, range: 560, cd: 9, status: ST.slow, pool: 2.5 }, 'water')],
  ],
  wood: [
    [1, S({ id: 'x_sx_wood0', name: '缠绕术', k: 'circle', r: 110, tele: 0.75, pow: 1.2, range: 560, cd: 8, status: ST.root }, 'poison')],
    [1, S({ id: 'x_sx_wood1', name: '木刺术', k: 'salvo', n: 3, waves: 2, spread: 0.3, tele: 0.35, pow: 0.9, range: 580, min: 110, cd: 6, status: ST.poison }, 'poison')],
    [2, hook('x_sx_wood2', '藤鞭摄引', 'poison')],
  ],
  metal: [
    [1, S({ id: 'x_sx_metal0', name: '金针术', k: 'salvo', n: 5, waves: 1, spread: 0.6, tele: 0.35, pow: 0.75, range: 560, min: 110, cd: 5 }, 'metal')],
    [1, spiral('x_sx_metal1', '回旋金刃', 'metal')],
    [2, fury('x_sx_metal2', '金刚咒', 'gold')],
  ],
};

/** 散修的杂学：没有师承，符箓、法器、丹药、身法东拼西凑——每人从中随机带三样 */
export const X_MISC: Entry[] = [
  [1, S({ id: 'x_mi_fu1', name: '火弹符', k: 'salvo', n: 1, waves: 3, spread: 0.1, tele: 0.3, pow: 0.85, range: 560, min: 120, cd: 6, status: ST.burn }, 'fire')],
  [1, S({ id: 'x_mi_fu2', name: '冰锥符', k: 'salvo', n: 3, waves: 1, spread: 0.3, tele: 0.3, pow: 0.85, range: 560, min: 120, cd: 6, status: ST.slow }, 'ice')],
  [1, S({ id: 'x_mi_fu3', name: '金刚符', k: 'guard', dur: 4, tele: 0.3, range: 700, cd: 16 }, 'gold')],
  [1, S({ id: 'x_mi_fa1', name: '飞针法器', k: 'salvo', n: 4, waves: 1, spread: 0.5, tele: 0.35, pow: 0.75, range: 560, min: 110, cd: 5 }, 'metal')],
  [1, track('x_mi_fa2', '铜钱法器·连环', 'gold', { r: 80, pow: 1.2 })],
  [1, fury('x_mi_dan', '吞下狂暴丹', 'blood', { pow: 1.25, dur: 7, hpBelow: 0.6, once: true })],
  [2, S({ id: 'x_mi_lei', name: '天雷子', k: 'circle', r: 140, tele: 0.9, pow: 2.6, range: 580, cd: 14, status: ST.shock }, 'thunder')],
  [2, S({ id: 'x_mi_dun', name: '神行符', k: 'blink', tele: 0.25, pow: 1.4, range: 600, min: 150, cd: 8 }, 'wind')],
  [2, march('x_mi_zhen', '爆炎符阵', 'fire', { status: ST.burn })],
  [2, hook('x_mi_suo', '捆仙绳（仿品）', 'gold', { status: ST.root })],
];
