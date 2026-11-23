// v0.54：秘境——可以走进去的独立场景。这里只放数据：主题（地面、墙、摆件、妖物）、中 / 大秘境名录。玩法见 world/mijing.ts。

/** 秘境开关：负责人看过之后认为秘境的画面与本作风格不符，先撤回（代码留着，重做时打开）。
 *  关掉以后：大地图上不再有秘境入口与「秘？」传闻，前人洞府没有「入府探查」，友人相约同探回到会合即得机缘，众生行没有秘境人潮。 */
export const MIJING_ON = false;

export type Theme = 'cave' | 'tomb' | 'ice' | 'fire' | 'forest' | 'desert' | 'sea' | 'palace' | 'blood';
export interface ThemeDef {
  name: string;
  /** 地面画材（gl/groundTex 的层号）与罩色 */
  floor: number; floorTint: string;
  /** 墙体：顶面（岩体）与立面的颜色、墨线 */
  rock: string; face: string; faceDark: string; ink: string;
  /** 环境光：越暗越要靠神识与灯火 */
  dark: number; ambient: string;
  /** 大摆件（柱、祭坛、石像）/ 小摆件（白骨、灵晶、碎石）/ 灯火（发光） */
  props: string[]; deco: string[]; lights: string[];
  /** 妖物：按名字里的字挑（与敌人表的 name 匹配），挑不到退回野外随机 */
  foes: RegExp;
  /** 摆件调色变体（bldTex2 的 |dark 等） */
  variant?: string;
  mood: string;
}

export const THEMES: Record<Theme, ThemeDef> = {
  cave: { name: '古修洞府', floor: 7, floorTint: 'rgba(60,52,40,0.18)', rock: '#3a362f', face: '#6a6152', faceDark: '#4a4339', ink: '#1f1c18', dark: 0.55, ambient: '200,190,170',
    props: ['v:prop_cave_bed', 'v:prop_cave_furnace', 'v:prop_cave_pillar', 'v:prop_cave_pillar', 'p_pillar_broken', 'p_e_pillar_b', 'p_stele_b', 'p_e_cave_table', 'p_censer'], deco: ['p_bones', 'p_ore', 'p_crystal_s', 'p_pillar_fallen'], lights: ['p_brazier', 'p_crystal_l'], foes: /[傀儡魂尸骷髅鼠蝠蛛]/, mood: '石壁上的禁制纹路早已黯淡，空气里有股陈年的尘土与丹香。' },
  tomb: { name: '古墓阴穴', floor: 13, floorTint: 'rgba(40,40,60,0.22)', rock: '#2a2a33', face: '#55525e', faceDark: '#3a3843', ink: '#15141a', dark: 0.7, ambient: '170,180,210',
    props: ['v:prop_tomb_coffin', 'v:prop_tomb_guardian', 'v:prop_tomb_coffin', 'p_coffin', 'p_e_altar_broken', 'p_stele_c', 'p_e_sealchain', 'p_cairn'], deco: ['p_skeleton', 'p_bones', 'p_pillar_fallen'], lights: ['v:prop_tomb_lamp', 'v:prop_tomb_lamp', 'p_crystal_blood', 'p_slantern'], foes: /[魂尸骷髅鬼煞冤阴]/, variant: 'dark', mood: '阴风贴着地皮游走，远处隐约有铁链拖地的声音。' },
  ice: { name: '寒冰秘窟', floor: 8, floorTint: 'rgba(150,190,230,0.2)', rock: '#4a5a6a', face: '#9ab4c8', faceDark: '#6a8498', ink: '#24303a', dark: 0.35, ambient: '200,225,255',
    props: ['v:prop_ice_pillar', 'v:prop_ice_frozen', 'v:prop_ice_pillar', 'p_icepillar', 'p_e_icegap', 'p_stele_a', 'p_e_pillar_c'], deco: ['p_crystal_s', 'p_ore', 'p_bones'], lights: ['v:prop_ice_crystal', 'p_crystal_l', 'p_e_xt_icefire'], foes: /[冰雪寒霜蚕狼]/, variant: 'snow', mood: '呵气成霜，冰壁里封着些看不清的影子。' },
  fire: { name: '地火熔窟', floor: 12, floorTint: 'rgba(200,80,40,0.16)', rock: '#3a2620', face: '#7a4a34', faceDark: '#55301f', ink: '#1c100c', dark: 0.4, ambient: '255,190,150',
    props: ['v:prop_fire_pillar', 'v:prop_fire_vent', 'v:prop_fire_pillar', 'p_e_firemouth', 'p_e_pillar_a', 'p_altar', 'p_cauldron_dark'], deco: ['p_ore', 'p_crystal_blood', 'p_bones'], lights: ['v:prop_fire_altar', 'v:prop_fire_vent', 'p_e_holyfire', 'p_brazier'], foes: /[火炎焰蟾蜥赤]/, mood: '地缝里火光明灭，热浪一阵阵扑在脸上。' },
  forest: { name: '妖林深处', floor: 4, floorTint: 'rgba(40,80,50,0.18)', rock: '#24331f', face: '#4a5e3a', faceDark: '#33452a', ink: '#121a10', dark: 0.45, ambient: '190,220,180',
    props: ['v:prop_forest_roots', 'v:prop_forest_shrine', 'v:prop_forest_bones', 'p_e_eye_tree', 'p_stele_a', 'p_cairn', 'p_e_herb_plot'], deco: ['p_nest', 'p_bones', 'p_pillar_fallen'], lights: ['p_crystal_s', 'p_e_lingquan'], foes: /[狼虎豹熊猿蛇蟒蛛狐鹿]/, mood: '古木参天，枝叶遮得不见天日，树根间有兽径纵横。' },
  desert: { name: '黄沙古城', floor: 6, floorTint: 'rgba(200,170,110,0.16)', rock: '#5a4a32', face: '#a08458', faceDark: '#7a6240', ink: '#2a2014', dark: 0.3, ambient: '255,230,190',
    props: ['v:prop_desert_column', 'v:prop_desert_beast', 'v:prop_desert_urn', 'p_arch_ruin', 'p_s_ruins', 'p_pillar_broken', 'p_stele_c'], deco: ['p_skeleton', 'p_bones', 'p_cairn'], lights: ['p_brazier'], foes: /[蝎沙蜥狼骷髅]/, mood: '半埋在沙里的城垣只剩残壁，风过处沙粒簌簌落下。' },
  sea: { name: '海底遗宫', floor: 14, floorTint: 'rgba(60,140,170,0.2)', rock: '#1f3a44', face: '#3f7280', faceDark: '#2c5560', ink: '#0e1c22', dark: 0.5, ambient: '170,220,240',
    props: ['v:prop_sea_coral', 'v:prop_sea_clam', 'v:prop_sea_wreck', 'v:prop_sea_coral', 'p_coral', 'p_e_pillar_c', 'p_e_ship_s', 'p_stele_b'], deco: ['p_coral', 'p_crystal_s', 'p_bones'], lights: ['p_crystal_l'], foes: /[蟹鲨鳄鱼蛟海鲛蟒]/, mood: '避水的禁制还在运转，头顶是一层晃动的幽蓝水光。' },
  palace: { name: '上古大殿', floor: 9, floorTint: 'rgba(220,190,120,0.12)', rock: '#3a3020', face: '#8a7448', faceDark: '#5e4e30', ink: '#1a140c', dark: 0.35, ambient: '255,235,190',
    props: ['v:prop_palace_column', 'v:prop_palace_censer', 'v:prop_palace_column', 'v:prop_palace_throne', 'p_e_pillar_a', 'p_e_pillar_b', 'p_lion_l', 'p_lion_r', 'p_censer', 'p_e_seal_altar'], deco: ['p_pillar_fallen', 'p_crystal_s'], lights: ['p_brazier', 'p_lamppost'], foes: /[傀儡魂尸鬼将甲]/, mood: '金漆剥落的殿柱一根根撑起穹顶，殿心的阵台上灵光流转。' },
  blood: { name: '赤霄禁地', floor: 12, floorTint: 'rgba(150,30,30,0.2)', rock: '#2e1616', face: '#6a2a24', faceDark: '#4a1a16', ink: '#160808', dark: 0.5, ambient: '255,170,160',
    props: ['v:prop_blood_altar', 'v:prop_blood_banner', 'v:prop_blood_spikes', 'p_altar_blood', 'p_e_pillar_a', 'p_banner_demon', 'p_stele_c'], deco: ['p_skeleton', 'p_crystal_blood', 'p_bones'], lights: ['p_crystal_blood', 'p_brazier'], foes: /[蛟蟒狼蝠血蛇]/, variant: 'dark', mood: '血雾沉沉，地上散落着前几批弟子留下的残兵。' },
};

/** 秘境级别：1 小 · 2 中 · 3 大 */
export type MjTier = 1 | 2 | 3;
export const TIER_NAME = ['', '小秘境', '中秘境', '大秘境'];

export interface MijingDef {
  id: string; name: string; tier: MjTier; theme: Theme;
  /** 在大地图上的位置：地点 id（中 / 大秘境固定在原著险地、名地） */
  loc?: string;
  /** 境界下限 / 上限（赤霄禁地只许筑基以下进入） */
  realmMin: number; realmMax: number;
  floors: number; rooms: number;
  /** 大秘境：开启周期与窗口（日）；不填 = 随时可进 */
  period?: number; window?: number; phase?: number;
  /** 首领（敌人 id） */
  boss?: string;
  desc: string;
}

/** 中 / 大秘境名录（小秘境由野外的前人洞府、传闻、邀约随时生成） */
export const MIJING: MijingDef[] = [
  // —— 中秘境：原著险地
  { id: 'taiyue', name: '苍岳山脉深处', tier: 2, theme: 'forest', loc: 'taiyue', realmMin: 1, realmMax: 9, floors: 1, rooms: 11, boss: 'jinhu', desc: '梁国最深的山，妖兽成群，深处据说有化形大妖的洞府。' },
  { id: 'beihan', name: '北寒雪原·冰窟', tier: 2, theme: 'ice', loc: 'beihan', realmMin: 2, realmMax: 9, floors: 1, rooms: 12, boss: 'bingpolang', desc: '雪原下的冰窟连绵百里，寒气能冻裂法器。' },
  { id: 'jixi', name: '极西荒漠·古城', tier: 2, theme: 'desert', loc: 'jixi_desert', realmMin: 2, realmMax: 9, floors: 1, rooms: 12, boss: 'xiehuang', desc: '黄沙之下埋着一座上古城池，城中有蝎皇盘踞。' },
  { id: 'caoyuan', name: '草原深处·兽冢', tier: 2, theme: 'forest', loc: 'caoyuan', realmMin: 1, realmMax: 9, floors: 1, rooms: 10, boss: 'yinlang', desc: '草原妖狼世代埋骨之处，狼王守着兽冢。' },
  { id: 'yinyang', name: '阴阳窟', tier: 2, theme: 'tomb', loc: 'yinyang', realmMin: 2, realmMax: 9, floors: 2, rooms: 9, boss: 'guijiang', desc: '阴阳二气交汇，鬼物丛生的地窟。' },
  { id: 'ximo', name: '中州西漠·沙窟', tier: 2, theme: 'desert', loc: 'xi_mo', realmMin: 3, realmMax: 9, floors: 1, rooms: 12, boss: 'xiehuang', desc: '中州西陲的沙窟，魔道散修与蝎群混居。' },
  { id: 'waihai', name: '外海妖域·遗宫', tier: 2, theme: 'sea', loc: 'waihai', realmMin: 3, realmMax: 9, floors: 2, rooms: 9, boss: 'biyanjiao', desc: '外海深处沉没的宫殿，海兽以此为巢。' },
  { id: 'zhuimo_wai', name: '陨魔谷·外围', tier: 2, theme: 'fire', loc: 'zhuimo', realmMin: 3, realmMax: 9, floors: 1, rooms: 12, boss: 'huochan', desc: '陨魔谷外围的熔窟，火蟾、蟒兽出没。' },
  // —— 大秘境：原著名地（按原著节奏定期开启）
  { id: 'xuese', name: '赤霄禁地', tier: 3, theme: 'blood', loc: 'xuese', realmMin: 1, realmMax: 2, floors: 2, rooms: 12, period: 1800, window: 40, phase: 640, boss: 'mojiao', desc: '梁国七派每五年开启一次的禁地，只许筑基以下弟子入内，筑基丹主药就生在里头。' },
  { id: 'xutian', name: '归墟殿', tier: 3, theme: 'palace', loc: 'xutian', realmMin: 3, realmMax: 9, floors: 3, rooms: 12, period: 3600, window: 60, phase: 2600, boss: 'jinkui', desc: '沧溟海外海的上古大殿，三百年一现，内藏归墟鼎与玄霜冰焰。' },
  { id: 'kunwu', name: '封魔山', tier: 3, theme: 'palace', loc: 'kunwu', realmMin: 3, realmMax: 9, floors: 3, rooms: 12, period: 4200, window: 60, phase: 3900, boss: 'yinchi', desc: '昆吾殿下镇着上古魔物，禁制一松，正魔两道蜂拥而至。' },
  { id: 'zhuimo', name: '陨魔谷·谷底', tier: 3, theme: 'fire', loc: 'zhuimo', realmMin: 3, realmMax: 9, floors: 3, rooms: 12, period: 3000, window: 50, phase: 1500, boss: 'gumo_xueyan', desc: '谷底封印着古魔分身，封印松动时宝光冲天。' },
  // —— 灵界秘境：风元大陆 / 蛮荒古境 / 广寒碎域 / 无尽雷海
  { id: 'wanmu_mj', name: '万木古瘴·灵根海', tier: 2, theme: 'forest', loc: 'wanmu_gu', realmMin: 4, realmMax: 9, floors: 2, rooms: 11, boss: 'ling_jinhu', desc: '蛮荒古境毒瘴深处的太古药林，生有万年血灵芝与天心神果，灵木高阶凶禽潜伏其中。' },
  { id: 'leihai_mj', name: '聚雷深渊·雷池眼', tier: 2, theme: 'fire', loc: 'leihai_yan', realmMin: 5, realmMax: 9, floors: 2, rooms: 12, boss: 'ling_leijiao_shou', desc: '雷鸣大陆沧澜雷海核心眼区，漫天辟邪神雷终年淬炼雷海精金。' },
  { id: 'moyuan_mj', name: '洗煞魔渊·前哨秘隙', tier: 2, theme: 'blood', loc: 'fengmo_yuan', realmMin: 5, realmMax: 9, floors: 2, rooms: 11, boss: 'ling_moyuan', desc: '两族前线与魔族势力交错的空间裂缝，盛产空冥石与残存古宝。' },
  { id: 'guanghan_mj', name: '广寒界·太阴冰狱', tier: 3, theme: 'ice', loc: 'xuedong_ling', realmMin: 6, realmMax: 9, floors: 3, rooms: 12, period: 3600, window: 60, phase: 1200, boss: 'ling_xuanwu', desc: '灵界最负盛名的碎域圣境，万年一开的广寒殿遗址内蕴太阴寒髓与玄天混沌残胚。' },
  { id: 'jiuyou_mj', name: '九幽冥府·血冥窟', tier: 3, theme: 'tomb', loc: 'jiuyou_di', realmMin: 6, realmMax: 9, floors: 3, rooms: 12, period: 4200, window: 60, phase: 2400, boss: 'ling_jiuyou', desc: '蛮荒绝地之下连通九幽的鬼煞祖窟，非炼虚、合体期大能不敢深入。' },
];
export const MJ_BY_ID: Record<string, MijingDef> = Object.fromEntries(MIJING.map((m) => [m.id, m]));

/** 大秘境此刻是否开启；返回距下次开启 / 关闭的天数 */
export function mjOpen(m: MijingDef, day: number): { open: boolean; days: number } {
  if (!m.period) return { open: true, days: 0 };
  const ph = ((day - (m.phase ?? 0)) % m.period + m.period) % m.period;
  if (ph < (m.window ?? 30)) return { open: true, days: Math.ceil((m.window ?? 30) - ph) };
  return { open: false, days: Math.ceil(m.period - ph) };
}
