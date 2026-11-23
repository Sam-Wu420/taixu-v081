// v0.60「功法满天下」：五十一门新心法（v0.61 补五门）——三十七座宗门各一门镇派心法（只在本宗藏经阁），另有九门散落天下的散修功法。
// 心法是「主修」：定修炼速度、可修到的最高境界、气血 / 法力 / 攻防加成，以及对某几系法术的威力加成（school）。
// 转修见 world/game.ts 的 learnGongfa；NPC 所修见 world/living.ts 的 SECT_GF。
import type { GongfaDef } from './skills';
import type { Dao } from './sects';
import { REALMS } from './realms';

type Sch = Record<string, number>;
const G = (id: string, name: string, dao: Dao, tier: number, rate: number, maxRealm: number, flavor: string, o: Partial<GongfaDef> & { school?: Sch } = {}): GongfaDef =>
  ({ id, name, dao, tier, rate, maxRealm, desc: flavor, ...o });

const LIST: GongfaDef[] = [
  // ---------------- 新宗门镇派心法 ----------------
  G('haoran_jing', '浩然正气诀', 'zheng', 3, 1.2, 5, '浩然阁镇派心法。读书养气，气成则百邪不侵。', { sect: 'haoran', def: 0.2, hp: 0.15, school: { 符: 0.2, 识: 0.2, 体: 0.1 } }),
  G('taizhen_jing', '太真九转玄功', 'zheng', 3, 1.25, 5, '太真门镇派心法。九转炼真，雷法与符箓相辅相成。', { sect: 'taizhen', mp: 0.25, school: { 雷: 0.25, 符: 0.15, 剑: 0.1 } }),
  G('xingdou_jing', '周天星斗诀', 'zheng', 2, 1.15, 4, '天星宗镇派心法。以周天星辰为盘，阵道一途事半功倍。', { sect: 'tianxingzong', mp: 0.15, school: { 阵: 0.35 } }),
  G('tianfu_jing', '天符宝箓', 'zheng', 2, 1.15, 4, '天符门镇派心法。以符入道，一身法力尽在朱砂黄纸之间。', { sect: 'tianfu', mp: 0.2, school: { 符: 0.35 } }),
  G('moyan_jing', '魔焰真经', 'mo', 3, 1.4, 4, '魔焰门镇派魔功。引地肺阴火炼体，进境奇快，火气攻心。', { sect: 'moyan', atk: 0.15, school: { 火: 0.2, 魔: 0.2 } }),
  G('xuesha_jing', '血煞魔典', 'mo', 3, 1.5, 4, '血煞教镇教魔典。以血养煞，修炼之速冠绝魔道，只是根基虚浮。', { sect: 'xuesha', atk: 0.25, hp: -0.1, school: { 魔: 0.3 } }),
  G('wanfa_jing', '万法真解', 'zheng', 4, 1.3, 5, '万法门镇派心法。五行并修、万法皆通，不求一系之极，但求无所不能。', { sect: 'wanfa', mp: 0.3, school: { 火: 0.12, 冰: 0.12, 雷: 0.12, 风: 0.12, 土: 0.12, 木: 0.12, 符: 0.12 } }),
  G('liulian_jing', '六连猎妖诀', 'zhong', 2, 1.15, 4, '六合殿猎妖世家的家传心法。气血绵长，最宜驭兽与久战。', { sect: 'liulian', atk: 0.12, hp: 0.2, school: { 御: 0.3 } }),
  G('leiyin_jing', '雷音金刚经', 'fo', 4, 1.2, 5, '雷音宗镇寺经文。金刚不坏、雷音护法，法体双修的佛门正宗。', { sect: 'leiyin', hp: 0.45, def: 0.3, school: { 体: 0.3, 雷: 0.1 } }),
  G('tianshi_jing', '天师正一诀', 'zheng', 3, 1.25, 5, '天师府嫡传心法。敕令雷霆、驱役符箓，专克妖邪。', { sect: 'tianshi', mp: 0.2, def: 0.1, school: { 雷: 0.2, 符: 0.25 } }),
  G('motuo_jing', '魔陀灭世经', 'mo', 4, 1.45, 5, '魔陀山镇山魔经。魔气灌体，攻伐无双，修到深处连心性也要变。', { sect: 'motuo', atk: 0.2, hp: 0.2, school: { 魔: 0.25, 识: 0.1 } }),
  G('dusheng_jing', '万毒真经', 'mo', 3, 1.35, 4, '毒圣门镇派毒经。以身饲毒、以毒炼气，举手投足皆是剧毒。', { sect: 'dusheng', atk: 0.1, mp: 0.15, school: { 魔: 0.25, 木: 0.1 } }),
  G('xiaoji_jing', '小极玄冰诀', 'zhong', 4, 1.25, 5, '寒极宫镇宫心法。于极寒之地凝练玄冰真气，冰系法术威力大增。', { sect: 'xiaoji', mp: 0.25, school: { 冰: 0.35 } }),
  G('wanyao_jing', '万妖化形诀', 'yao', 3, 1.2, 5, '万妖谷的人妖通修之法。借妖兽精血淬体，气血雄浑，驭兽尤为得心应手。', { sect: 'wanyao', hp: 0.35, atk: 0.15, school: { 御: 0.25, 体: 0.15 } }),
  G('jiuxian_jing', '九仙玉女心经', 'zheng', 3, 1.3, 4, '九霄宫镇宫心法。身轻如絮、剑随心动，女修修之进境更快。', { sect: 'jiuxian', mp: 0.2, sword: 0.1, school: { 剑: 0.1, 身: 0.2 } }),
  // ---------------- 旧有各派镇派心法 ----------------
  G('qixuan_xf', '七玄心法', 'zhong', 0, 0.9, 1, '青玄门的江湖内功，算不得真正的修仙功法，胜在打熬筋骨。', { sect: 'qixuan', hp: 0.1, school: { 身: 0.15 } }),
  G('huangfeng_xj', '青霞心经', 'zheng', 1, 1.1, 3, '青霞谷弟子入门所修，中正平和。', { sect: 'huangfeng', mp: 0.1, school: { 火: 0.15 } }),
  G('sunv_lh', '素女轮回功', 'zheng', 3, 1.3, 4, '凝霜宗不传之秘，女修修之法力精纯，冰系法术尤盛。', { sect: 'yanyue', mp: 0.25, school: { 冰: 0.25 } }),
  G('yushou_zj', '御兽真诀', 'zheng', 1, 1.1, 3, '驭兽山心法，与灵兽心意相通。', { sect: 'lingshou', hp: 0.15, school: { 御: 0.3 } }),
  G('qingxu_xg', '清虚玄功', 'zheng', 2, 1.15, 4, '清微门道家心法，清静无为，法力绵长。', { sect: 'qingxu', mp: 0.2, school: { 木: 0.2, 符: 0.1 } }),
  G('huadao_j', '化刀诀', 'zheng', 1, 1.1, 3, '断刀坞刀修心法，一身法力尽化刀意。', { sect: 'huadao', atk: 0.18, school: { 剑: 0.15 } }),
  G('tianque_zy', '天阙镇岳功', 'zheng', 1, 1.1, 3, '天枢堡心法，稳如山岳。', { sect: 'tianque', def: 0.3, hp: 0.2, school: { 土: 0.25 } }),
  G('jujian_xj', '巨剑心诀', 'zheng', 1, 1.1, 3, '重岳剑门心法，重剑无锋，大巧不工。', { sect: 'jujian', atk: 0.15, sword: 0.1, school: { 剑: 0.1 } }),
  G('luoyun_cs', '落云长生诀', 'zheng', 3, 1.25, 4, '栖云宗心法，木气长生，最养寿元与灵药。', { sect: 'luoyun', hp: 0.2, mp: 0.15, school: { 木: 0.3 } }),
  G('gujian_xj', '古剑心经', 'zheng', 3, 1.2, 4, '藏剑门剑修心法，以剑养气、以气御剑。', { sect: 'gujian', atk: 0.15, sword: 0.15, school: { 剑: 0.15 } }),
  G('baiqiao_jg', '百巧机关术', 'zheng', 2, 1.1, 4, '天工院心法，神识细腻，傀儡机关如臂使指。', { sect: 'baiqiao', mp: 0.15, school: { 御: 0.25, 阵: 0.15 } }),
  G('guiling_xs', '鬼灵血煞功', 'mo', 3, 1.4, 4, '阴灵门魔功，驱鬼役魂，煞气凌人。', { sect: 'guiling', atk: 0.15, school: { 魔: 0.25 } }),
  G('hehuan_mf', '合欢秘法', 'mo', 3, 1.5, 4, '天欢宗双修采补之术，进境奇快，惑人心神。', { sect: 'hehuan', mp: 0.2, school: { 识: 0.2, 魔: 0.1 } }),
  G('yuling_j', '御灵诀', 'mo', 2, 1.35, 4, '役灵宗心法，以血祭之法强驭灵兽。', { sect: 'yuling', hp: 0.15, school: { 御: 0.3 } }),
  G('qianhuan_mg', '千幻魔功', 'mo', 2, 1.35, 4, '万幻宗魔功，虚实难辨，专攻神识。', { sect: 'qianhuan', mp: 0.2, school: { 识: 0.3 } }),
  G('tiansha_xg', '天煞血功', 'mo', 3, 1.45, 4, '玄煞宗魔功，杀伐果决，以战养战。', { sect: 'tiansha', atk: 0.25, school: { 魔: 0.2 } }),
  G('yinluo_gj', '阴罗鬼经', 'mo', 4, 1.4, 5, '幽罗宗鬼道真传，万魂为幡。', { sect: 'yinluo', mp: 0.2, atk: 0.1, school: { 魔: 0.3 } }),
  G('tianmo_df', '天魔大法', 'mo', 4, 1.5, 5, '天魔宗镇宗魔功，中州魔道第一功法。', { sect: 'tianmo', atk: 0.2, hp: 0.2, school: { 魔: 0.3 } }),
  G('taiyi_hq', '太一化清功', 'zheng', 4, 1.3, 5, '太一门镇派心法，一气化三清，雷法通神。', { sect: 'taiyi', mp: 0.25, school: { 雷: 0.3 } }),
  G('huayi_xf', '化意心法', 'zheng', 2, 1.2, 4, '归意门心法，以意驭气，神识敏锐。', { sect: 'huayi', mp: 0.15, school: { 识: 0.2, 木: 0.1 } }),
  G('qianzhu_lj', '千竹雷诀', 'zhong', 2, 1.2, 4, '万竹教心法，雷法与傀儡并修。', { sect: 'qianzhu', mp: 0.15, school: { 雷: 0.2, 御: 0.15 } }),
  G('tianlan_sd', '天穹圣典', 'zhong', 2, 1.2, 4, '天穹圣殿法士的炼体圣典，气血如牛。', { sect: 'tianlan', hp: 0.3, school: { 体: 0.25 } }),
  // ---------------- v0.61：补齐五派镇派心法 ----------------
  G('mulan_fj', '朔漠法诀', 'zhong', 2, 1.2, 4, '朔漠法士代代相传的草原法诀，风火并用，来去如骑。', { sect: 'mulan', mp: 0.15, school: { 风: 0.25, 火: 0.1 } }),
  G('yejia_xf', '叶家秘传心法', 'zheng', 3, 1.2, 4, '中州叶家不传外姓的家传心法，根基厚重。', { sect: 'yejia', hp: 0.15, def: 0.15, school: { 土: 0.15, 剑: 0.1 } }),
  G('xingchen_j', '星辰诀', 'zhong', 4, 1.3, 5, '星罗殿镇宫心法。引周天星力入体，阵法雷法皆得其助。', { sect: 'tianxing', mp: 0.25, school: { 阵: 0.2, 雷: 0.15 } }),
  G('nixing_j', '逆星诀', 'mo', 3, 1.4, 4, '叛星盟诸老怪合创的功法，专为破星罗殿大阵而生，杀伐凌厉。', { sect: 'leikong', atk: 0.2, school: { 魔: 0.2 } }),
  G('miaoyin_xj', '妙音心诀', 'zhong', 2, 1.15, 4, '清音门心法。以音入道，惑人心神于无形。', { sect: 'miaoyin', mp: 0.2, school: { 识: 0.25, 风: 0.1 } }),
  // ---------------- 散落天下：坊市、拍卖会、古修洞府 ----------------
  G('wuxing_tn', '五行吐纳诀', 'zhong', 0, 0.95, 3, '散修间流传最广的吐纳法，五行皆沾、样样稀松。', { wild: 1, school: { 火: 0.06, 冰: 0.06, 土: 0.06, 木: 0.06, 风: 0.06 } }),
  G('hunyuan_g', '混元功', 'zhong', 1, 1.05, 4, '散修功法里难得的扎实货色，根基稳固。', { wild: 2, hp: 0.15, def: 0.1 }),
  G('xiaoyao_y', '逍遥游', 'zhong', 2, 1.1, 4, '不知哪位散仙所留，身法飘逸，来去如风。', { wild: 3, school: { 身: 0.3, 风: 0.2 } }),
  G('fentian_j', '焚天诀', 'zhong', 2, 1.25, 4, '古修士所留的火系功法，真火精纯。', { wild: 3, atk: 0.15, school: { 火: 0.35 } }),
  G('leishen_j', '御雷真诀', 'zhong', 2, 1.25, 4, '雷修功法，引九天之雷淬炼经脉。', { wild: 3, school: { 雷: 0.35 } }),
  G('houtu_j', '厚土经', 'zhong', 2, 1.1, 4, '土修功法，厚德载物，防御惊人。', { wild: 3, def: 0.35, hp: 0.2, school: { 土: 0.3 } }),
  G('changsheng_j', '长生诀', 'zheng', 3, 1.2, 5, '上古木修所创，生机绵延不绝。只在拍卖会上露面。', { wild: 4, hp: 0.25, school: { 木: 0.25 } }),
  G('taixu_jj', '太虚剑经', 'zheng', 4, 1.35, 5, '上古剑修「太虚真人」遗世剑经，剑意直指太虚。可遇不可求。', { wild: 4, atk: 0.15, sword: 0.2, school: { 剑: 0.15 } }),
  G('jiuyou_ml', '九幽魔录', 'mo', 4, 1.5, 5, '上古魔修陨落处流出的魔道总纲，修之魔威滔天。可遇不可求。', { wild: 4, atk: 0.2, mp: 0.15, school: { 魔: 0.3 } }),
  // ---------------- 灵界（6-8境） ----------------
  G('qingyuan_lingjie', '青元剑诀·灵界篇', 'zheng', 4, 1.48, 8, '青元剑诀飞升灵界后的后续全本，十三层剑意贯通大乘。', { wild: 4, sword: 0.38, atk: 0.22, school: { 剑: 0.25 }, price: 115000 }),
  G('baimai_lianbao', '百脉炼宝诀', 'zhong', 4, 1.42, 8, '天工灵阁秘传，以周身百脉祭炼灵宝，肉身如宝坯般坚不可摧。', { sect: 'tiangong_lg', hp: 0.5, def: 0.35, school: { 体: 0.2, 御: 0.25 }, price: 98000 }),
  G('jingzhe_shier', '惊蛰十二变', 'yao', 4, 1.5, 8, '集真灵精血炼形的无上神通心法，化形之后战力惊天动地。', { sect: 'yaohuang_dian', hp: 0.65, atk: 0.3, school: { 体: 0.35, 御: 0.25 }, price: 128000 }),
  G('qingming_guigong', '青冥鬼经', 'mo', 4, 1.52, 8, '青冥鬼宗嫡传心法，鬼气森然、神魂坚如幽铁。', { sect: 'qingming_gz', mp: 0.4, atk: 0.24, school: { 魔: 0.35, 识: 0.2 }, price: 96000 }),
  G('guanghan_bingjue', '广寒太阴诀', 'zheng', 4, 1.5, 8, '广寒仙殿镇殿功法，引太阴真气洗髓，冰系神通冠绝北域。', { sect: 'guanghan_sy', mp: 0.45, school: { 冰: 0.45 }, price: 118000 }),
  G('zixiao_leidian', '紫霄神雷诀', 'zhong', 4, 1.48, 8, '紫霄雷殿于无尽雷海参悟之法，御使九霄神雷如臂使指。', { sect: 'leihai_dian', mp: 0.35, atk: 0.2, school: { 雷: 0.45 }, price: 112000 }),
  // ---------------- 仙界（9-12境） ----------------
  G('dawuxing_huanshi', '大五行幻世诀', 'zheng', 4, 1.75, 12, '仙界五系法则合一的无上仙经，五行生克流转不息，可证大罗。', { wild: 4, mp: 0.45, def: 0.25, school: { 火: 0.25, 冰: 0.25, 土: 0.25, 木: 0.25, 雷: 0.25 }, price: 420000 }),
  G('zhenyan_hualun', '真言化轮经', 'zhong', 4, 1.85, 12, '轮回古殿所藏时间法则真仙典籍，一念真言宝轮逆乱光阴。', { sect: 'lunhui_gd', mp: 0.4, def: 0.3, school: { 识: 0.4, 体: 0.3 }, price: 460000 }),
  G('dazhoutian_xingyuan', '大周天星元功', 'zheng', 4, 1.8, 12, '广寒仙阁执掌周天星辰之仙经，吸纳太古星辉入体。', { sect: 'guanghan_xg', hp: 0.4, mp: 0.4, school: { 阵: 0.4, 冰: 0.3 }, price: 440000 }),
  G('lianshen_shu', '炼神术（仙界全本）', 'zhong', 4, 1.72, 12, '传自天庭的神念第一禁术，七层大成后神识笼罩一域，直抵大罗。', { wild: 4, mp: 0.55, school: { 识: 0.55 }, price: 490000 }),
];

const pct = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`;
/** 心法加成的一句话说明（面板、卷轴描述共用） */
export function gongfaBonusText(g: GongfaDef): string {
  const out: string[] = [];
  if (g.rate !== 1) out.push(`修炼${pct(g.rate - 1)}`);
  if (g.hp) out.push(`气血${pct(g.hp)}`);
  if (g.mp) out.push(`法力${pct(g.mp)}`);
  if (g.atk) out.push(`攻击${pct(g.atk)}`);
  if (g.def) out.push(`防御${pct(g.def)}`);
  if (g.sword) out.push(`剑诀${pct(g.sword)}`);
  for (const [k, v] of Object.entries(g.school ?? {})) out.push(`${k}系${pct(v)}`);
  out.push(`可修至${REALMS[g.maxRealm]?.name ?? ['凡人', '炼气', '筑基', '结丹', '元婴', '化神'][g.maxRealm] ?? '高阶'}`);
  return out.join('，');
}
for (const g of LIST) g.desc = `${g.desc}（${gongfaBonusText(g)}）`;

export const XGONGFA: Record<string, GongfaDef> = Object.fromEntries(LIST.map((g) => [g.id, g]));
