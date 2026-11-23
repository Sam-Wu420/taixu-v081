// 丹方：主辅药、数量、基础成丹率（v0.70 起灵草不计年份，原先的年份要求折成更多株数）
export interface RecipeInput { id: string; n: number; minAge?: number }
/** 第四十步：特殊炼制——碧竹飞云剑的首炼、续炼（每根金雷竹添十二口，至七十二口）与庚精淬剑（大庚剑阵） */
export type RecipeSpecial = 'qz' | 'qz_add' | 'qz_geng';
export interface Recipe { id: string; name: string; out: string; outN: number; inputs: RecipeInput[]; base: number; days: number; reqRealm: number; desc: string; kind?: 'pill' | 'forge'; special?: RecipeSpecial }

export const RECIPES: Recipe[] = [
  { id: 'r_juqi', name: '聚气丹', out: 'pill_juqi', outN: 1, inputs: [{ id: 'herb_huangjing', n: 2 }], base: 0.6, days: 3, reqRealm: 1, desc: '炼气期常用，增修为、助冲关。' },
  { id: 'r_huiqi', name: '回气丹', out: 'pill_huiqi', outN: 2, inputs: [{ id: 'herb_lingzhi', n: 1 }, { id: 'herb_huangjing', n: 1 }], base: 0.7, days: 2, reqRealm: 1, desc: '迅速恢复法力。' },
  { id: 'r_liaoshang', name: '疗伤丹', out: 'pill_liaoshang', outN: 2, inputs: [{ id: 'herb_jinxin', n: 2 }], base: 0.7, days: 2, reqRealm: 1, desc: '迅速恢复气血。' },
  { id: 'r_huanglong', name: '黄龙丹', out: 'pill_huanglong', outN: 1, inputs: [{ id: 'herb_lingzhi', n: 2, minAge: 50 }, { id: 'herb_jinxin', n: 1 }], base: 0.5, days: 5, reqRealm: 1, desc: '药力浑厚，炼气期大增修为。需赤灵芝数株。' },
  { id: 'r_jinsui', name: '金髓丸', out: 'pill_jinsui', outN: 1, inputs: [{ id: 'herb_jinxin', n: 2, minAge: 60 }, { id: 'herb_huangjing', n: 2, minAge: 60 }, { id: 'mat_lingquan', n: 1 }], base: 0.45, days: 6, reqRealm: 1, desc: '洗练经脉，增加修为。' },
  { id: 'r_dingyan', name: '定颜丹', out: 'pill_dingyan', outN: 1, inputs: [{ id: 'herb_xuelian', n: 1 }, { id: 'herb_huangjing', n: 2, minAge: 30 }], base: 0.4, days: 6, reqRealm: 1, desc: '容颜永驻，女修梦寐以求。' },
  { id: 'r_zhuji', name: '筑基丹', out: 'pill_zhuji', outN: 1, inputs: [{ id: 'herb_zihou', n: 1, minAge: 100 }, { id: 'herb_tianling', n: 1, minAge: 100 }, { id: 'herb_huangjing', n: 3, minAge: 100 }], base: 0.2, days: 10, reqRealm: 1, desc: '冲击筑基必备。主药紫猴花、天灵果各需数株——问道残卷的墨露可让灵药一株化三。' },
  { id: 'r_juling', name: '聚灵丹', out: 'pill_juling', outN: 1, inputs: [{ id: 'herb_xuelian', n: 1, minAge: 100 }, { id: 'herb_lingzhi', n: 2, minAge: 100 }], base: 0.35, days: 8, reqRealm: 2, desc: '筑基期增长修为，冲击小瓶颈。' },
  // 以妖丹入药（第十五步）
  { id: 'r_yanghun2', name: '养魂丹（鼠目方）', out: 'pill_yanghun', outN: 1, inputs: [{ id: 'mat_shuangtongmu', n: 3 }, { id: 'mat_yaodan3', n: 1 }, { id: 'mat_lingquan', n: 1 }], base: 0.3, days: 10, reqRealm: 2, desc: '以双瞳鼠神目代替冰魄草，温养神魂、提升神识。' },
  { id: 'r_jiangchen', name: '降尘丹', out: 'pill_jiangchen', outN: 1, inputs: [{ id: 'herb_huolong', n: 1, minAge: 300 }, { id: 'mat_yaodan5', n: 1 }, { id: 'mat_lingquan', n: 2 }], base: 0.25, days: 15, reqRealm: 2, desc: '结丹辅助圣药。主药火龙果数株，佐以五级妖丹。' },
  { id: 'r_ningyuan', name: '凝元丹', out: 'pill_ningyuan', outN: 1, inputs: [{ id: 'herb_bingpo', n: 1, minAge: 100 }, { id: 'mat_yaodan5', n: 1 }], base: 0.4, days: 10, reqRealm: 3, desc: '结丹期增长修为。' },
  { id: 'r_jiuqu', name: '九曲灵参丹', out: 'pill_jiuqu', outN: 1, inputs: [{ id: 'herb_jiuqu', n: 1 }, { id: 'mat_yaodan6', n: 1 }, { id: 'mat_lingquan', n: 2 }], base: 0.3, days: 30, reqRealm: 3, desc: '结婴圣药。九曲灵参会化形遁走，须敛息靠近、一击得手。' },
  // 第四十步：元婴期丹方（八、九级妖丹终于有了用处）
  { id: 'r_yuanling', name: '元灵丹', out: 'pill_yuanling', outN: 1, inputs: [{ id: 'herb_yangshen', n: 1 }, { id: 'mat_yaodan8', n: 1 }, { id: 'mat_lingquan', n: 3 }], base: 0.3, days: 30, reqRealm: 4, desc: '元婴期增长修为。主药万年灵乳，佐以八级妖丹。' },
  { id: 'r_zifu', name: '紫府玄元丹', out: 'pill_zifu', outN: 1, inputs: [{ id: 'herb_jiuqu', n: 1 }, { id: 'mat_yaodan9', n: 1 }, { id: 'herb_yangshen', n: 1 }], base: 0.22, days: 45, reqRealm: 4, desc: '元婴圣药。九曲灵参为君，九级妖丹为臣。' },
  { id: 'r_wanshou', name: '万寿丹', out: 'pill_wanshou', outN: 1, inputs: [{ id: 'herb_xuejing', n: 2, minAge: 1000 }, { id: 'mat_yaodan7', n: 1 }, { id: 'mat_lingquan', n: 2 }], base: 0.3, days: 30, reqRealm: 4, desc: '增寿六十载。需血精草十株——问道残卷的墨露可让灵药一株化三。' },
  { id: 'r_ningpo', name: '凝魄丹', out: 'pill_ningpo', outN: 1, inputs: [{ id: 'mat_yanghunmu', n: 1 }, { id: 'mat_yaodan7', n: 1 }, { id: 'herb_bingpo', n: 1, minAge: 500 }], base: 0.3, days: 25, reqRealm: 4, desc: '以养魂木温养神魂，神识大进。' },
  { id: 'r_peiying', name: '培婴丹', out: 'pill_peiying', outN: 1, inputs: [{ id: 'mat_yinzhima', n: 1 }, { id: 'herb_xuejing', n: 1, minAge: 300 }, { id: 'mat_yaodan7', n: 1 }], base: 0.2, days: 30, reqRealm: 3, desc: '结婴圣药之一。主药是极难捕捉的阴芝马血肉。' },
  { id: 'r_biyan', name: '碧焰酒', out: 'pill_biyan', outN: 1, inputs: [{ id: 'mat_shuanggongdu', n: 1 }, { id: 'mat_lingquan', n: 3 }, { id: 'herb_huolong', n: 1, minAge: 100 }], base: 0.35, days: 40, reqRealm: 3, desc: '以霜蚣寒毒酿酒，冰火相济，药力狂暴。' },
  { id: 'r_yanghun', name: '养魂丹', out: 'pill_yanghun', outN: 1, inputs: [{ id: 'herb_bingpo', n: 1, minAge: 200 }, { id: 'herb_xuejing', n: 1, minAge: 200 }, { id: 'mat_lingquan', n: 2 }], base: 0.25, days: 12, reqRealm: 2, desc: '温养神魂，永久提升神识。' },
  // ---------------- 炼器（需地火：城镇法器阁 / 宗门炼器房；野外以法力代火，成器率大减） ----------------
  { id: 'f_qingfeng', kind: 'forge', name: '青锋剑', out: 'art_qingfeng', outN: 1, inputs: [{ id: 'mat_tiejing', n: 8 }, { id: 'mat_yaodan1', n: 2 }], base: 0.6, days: 7, reqRealm: 1, desc: '最常见的飞剑。以铁精为胚，一级妖丹为引。' },
  { id: 'f_xuantie', kind: 'forge', name: '玄铁飞天盾', out: 'art_xuantie', outN: 1, inputs: [{ id: 'mat_xuantie', n: 4 }, { id: 'mat_tiejing', n: 6 }, { id: 'mat_yaodan2', n: 1 }], base: 0.45, days: 10, reqRealm: 1, desc: '沉重的玄铁盾，可飞旋护身。' },
  { id: 'f_tayun', kind: 'forge', name: '踏云靴', out: 'art_tayun', outN: 1, inputs: [{ id: 'mat_yunchiyu', n: 6 }, { id: 'mat_xuanyu', n: 2 }, { id: 'mat_yaodan2', n: 1 }], base: 0.4, days: 10, reqRealm: 1, desc: '以云翅鸟羽织入靴底，身轻如云。' },
  { id: 'f_wulong', kind: 'forge', name: '乌龙夺', out: 'art_wulong', outN: 1, inputs: [{ id: 'mat_mojiaozhao', n: 2 }, { id: 'mat_chitong', n: 4 }, { id: 'mat_yaodan3', n: 1 }], base: 0.4, days: 14, reqRealm: 2, desc: '' },
  { id: 'f_shenfeng', kind: 'forge', name: '神风舟', out: 'art_shenfeng', outN: 1, inputs: [{ id: 'mat_mojiaoqi', n: 2 }, { id: 'mat_xuantie', n: 2 }, { id: 'mat_yaodan4', n: 1 }], base: 0.35, days: 20, reqRealm: 2, desc: '' },
  { id: 'f_qingning', kind: 'forge', name: '青凝镜', out: 'art_qingning', outN: 1, inputs: [{ id: 'mat_qianmuyan', n: 2 }, { id: 'mat_xuanyu', n: 4 }, { id: 'mat_yaodan5', n: 1 }], base: 0.35, days: 20, reqRealm: 2, desc: '以千目妖眼珠磨入镜心，青光照处幻术无所遁形。' },
  { id: 'f_languang', kind: 'forge', name: '蓝光盾', out: 'art_languang', outN: 1, inputs: [{ id: 'mat_tujiapi', n: 1 }, { id: 'mat_xuantie', n: 4 }, { id: 'mat_yaodan6', n: 1 }], base: 0.3, days: 30, reqRealm: 3, desc: '以土甲龙厚皮为里、玄铁为表的护身法宝。' },
  { id: 'f_zibing', kind: 'forge', name: '紫冰镯', out: 'art_zibing', outN: 1, inputs: [{ id: 'mat_bingjialin', n: 2 }, { id: 'mat_xuanyu', n: 4 }, { id: 'mat_yaodan7', n: 1 }], base: 0.3, days: 30, reqRealm: 3, desc: '冰甲蟒鳞炼成的寒属法宝。' },
  { id: 'f_huanglin', kind: 'forge', name: '皇鳞甲', out: 'art_huanglin', outN: 1, inputs: [{ id: 'mat_dujiaolin', n: 3 }, { id: 'mat_yaodan8', n: 1 }], base: 0.3, days: 40, reqRealm: 3, desc: '以八级毒蛟鳞片缀成的宝甲。' },
  { id: 'f_sanyan', kind: 'forge', name: '三焰扇', out: 'art_sanyan', outN: 1, inputs: [{ id: 'mat_chihuolin', n: 6 }, { id: 'mat_zhijiao', n: 4 }, { id: 'mat_yaodan6', n: 2 }], base: 0.25, days: 60, reqRealm: 3, desc: '以赤火蛟鳞为扇骨的火属法宝，扇出三色灵焰。' },
  { id: 'f_fenglei', kind: 'forge', name: '云雷双翼', out: 'art_fenglei', outN: 1, inputs: [{ id: 'mat_leipenggu', n: 1 }, { id: 'mat_jinleizhu', n: 1 }, { id: 'mat_yaodan9', n: 1 }], base: 0.35, days: 90, reqRealm: 3, desc: '以伏魔金雷（金雷竹）炼化雷鹏骨翅——可施雷遁。' },
  // 第四十步：碧竹飞云剑（原著：六根万年金雷竹炼成七十二口；一根约炼十二口）
  { id: 'f_qingzhu', kind: 'forge', special: 'qz', name: '碧竹飞云剑（首炼十二口）', out: 'art_qingzhu', outN: 12, inputs: [{ id: 'mat_jinleizhu', n: 1 }, { id: 'mat_xuantie', n: 6 }, { id: 'mat_yaodan6', n: 1 }], base: 0.55, days: 60, reqRealm: 3, desc: '将万年金雷竹炼成纯净竹液，布下法阵融入火柱，制成剑胚后刻印微型法阵——十二口碧竹飞云剑，剑中自蕴伏魔金雷。（炼成即悟《伏魔金雷》）' },
  { id: 'f_qingzhu_add', kind: 'forge', special: 'qz_add', name: '碧竹飞云剑（续炼十二口）', out: 'art_qingzhu', outN: 12, inputs: [{ id: 'mat_jinleizhu', n: 1 }, { id: 'mat_xuantie', n: 4 }, { id: 'mat_yaodan6', n: 1 }], base: 0.6, days: 45, reqRealm: 3, desc: '再以一根金雷竹续炼十二口，与原有飞剑合为一套。（剑数越多，一次祭出的飞剑越多）' },
  { id: 'f_qz_geng', kind: 'forge', special: 'qz_geng', name: '庚精淬剑（大庚剑阵）', out: 'art_qingzhu', outN: 72, inputs: [{ id: 'mat_gengjing', n: 2 }, { id: 'mat_yaodan7', n: 1 }], base: 0.5, days: 60, reqRealm: 3, desc: '七十二口碧竹飞云剑凑齐之后，将庚精熔入剑身，飞剑坚韧锋利大增，方可布下青霄剑诀的大庚剑阵。（传说：庚精先后得自镇天城、中州京城拍卖会等处）' },
  // —— v0.53 阵法禁制：阵旗、阵盘 ——
  { id: 'f_zhenqi', kind: 'forge', name: '阵旗（十面）', out: 'zf_qi', outN: 10, inputs: [{ id: 'zf_mat_mu', n: 2 }, { id: 'zf_mat_mo', n: 1 }], base: 0.85, days: 2, reqRealm: 1, desc: '阵旗木作杆、灵墨绘纹，一炉十面。布阵消耗、收阵回收。' },
  { id: 'f_zhenqi2', kind: 'forge', name: '上品阵旗（六面）', out: 'zf_qi2', outN: 6, inputs: [{ id: 'zf_mat_mu', n: 3 }, { id: 'zf_mat_yu', n: 1 }, { id: 'zf_mat_mo', n: 2 }], base: 0.6, days: 5, reqRealm: 2, desc: '玉杆星纹，阵法威力 +25%、阵眼更难破。' },
  { id: 'f_zhenpan2', kind: 'forge', name: '铜阵盘', out: 'zf_pan2', outN: 1, inputs: [{ id: 'zf_mat_yu', n: 2 }, { id: 'mat_chitong', n: 4 }, { id: 'zf_mat_mo', n: 2 }], base: 0.5, days: 8, reqRealm: 2, desc: '可同时主持两座阵法，威力 +18%。' },
  { id: 'f_zhenpan3', kind: 'forge', name: '玉阵盘', out: 'zf_pan3', outN: 1, inputs: [{ id: 'zf_mat_yu', n: 6 }, { id: 'mat_xuanyu', n: 4 }, { id: 'zf_mat_mo', n: 4 }, { id: 'mat_yaodan5', n: 1 }], base: 0.35, days: 20, reqRealm: 3, desc: '可同时主持两座阵法，威力 +40%。' },
  // —— 灵界 & 仙界炼丹 / 炼器 ——
  { id: 'r_qingming', name: '青冥丹', out: 'pill_ling_qingming', outN: 2, inputs: [{ id: 'herb_ling_taiyicao', n: 2 }, { id: 'herb_ling_jinsuizhi', n: 1 }], base: 0.58, days: 8, reqRealm: 5, desc: '以太乙青灵草与金髓芝炼成的化神期常用灵丹。' },
  { id: 'r_heqi', name: '合气丹', out: 'pill_ling_heqi', outN: 1, inputs: [{ id: 'herb_ling_jinsuizhi', n: 2 }, { id: 'herb_ling_taiyang', n: 1 }, { id: 'mat_ling_lingye', n: 1 }], base: 0.48, days: 12, reqRealm: 5, desc: '炼虚修士日常服用的增修宝丹。' },
  { id: 'r_taiyi_hq', name: '太一化清丹', out: 'pill_ling_taiyi', outN: 1, inputs: [{ id: 'herb_ling_xuanbing', n: 1 }, { id: 'herb_ling_taiyicao', n: 2 }, { id: 'mat_ling_lingye', n: 1 }], base: 0.5, days: 10, reqRealm: 5, desc: '瞬间补满法力并洗涤识海杂念。' },
  { id: 'r_hunyuan', name: '混元丹', out: 'pill_ling_hunyuan', outN: 1, inputs: [{ id: 'herb_ling_jiuquwang', n: 1 }, { id: 'herb_ling_xuezhizhu', n: 2 }, { id: 'mat_ling_lingye', n: 2 }], base: 0.42, days: 22, reqRealm: 6, desc: '合体期精进修为的无上灵丹。' },
  { id: 'r_ling_wanshou', name: '万年天寿丹', out: 'pill_ling_wanshou', outN: 1, inputs: [{ id: 'herb_ling_jiuquwang', n: 2 }, { id: 'mat_ling_lingye', n: 3 }, { id: 'herb_ling_tianxin', n: 1 }], base: 0.35, days: 30, reqRealm: 6, desc: '增寿三百载，也可赐予下界凡尘或年迈亲友延寿。' },
  { id: 'r_huaxu', name: '化虚灵丹', out: 'pill_huaxu', outN: 1, inputs: [{ id: 'mat_taiyin_sui', n: 1 }, { id: 'herb_ling_taiyicao', n: 2 }, { id: 'mat_ling_lingye', n: 1 }], base: 0.45, days: 18, reqRealm: 5, desc: '助化神后期神魂化虚、突破炼虚期。' },
  { id: 'r_ningxiang', name: '凝相金丹', out: 'pill_ningxiang', outN: 1, inputs: [{ id: 'mat_leihai_jin', n: 1 }, { id: 'herb_ling_xuezhizhu', n: 2 }, { id: 'mat_taiyin_sui', n: 1 }], base: 0.4, days: 24, reqRealm: 6, desc: '凝练法相金身、破入合体期。' },
  { id: 'r_pojie', name: '破劫大乘丹', out: 'pill_pojie', outN: 1, inputs: [{ id: 'mat_leihai_jin', n: 2 }, { id: 'herb_ling_tianxin', n: 1 }, { id: 'mat_ling_lingye', n: 2 }], base: 0.38, days: 30, reqRealm: 7, desc: '护持元神渡过九九灭世天劫、登临大乘。' },
  { id: 'r_zhenxian', name: '化仙玉液丹', out: 'pill_zhenxian', outN: 1, inputs: [{ id: 'herb_xian_qiongjiang', n: 2 }, { id: 'mat_suiyue_jinlu', n: 1 }], base: 0.48, days: 20, reqRealm: 8, desc: '大乘转真仙、真仙淬炼仙元必备仙丹。' },
  { id: 'r_xuanxian', name: '开窍玄仙丹', out: 'pill_xuanxian', outN: 1, inputs: [{ id: 'herb_xian_fusang', n: 2 }, { id: 'mat_faze_jingsi', n: 1 }, { id: 'mat_suiyue_jinlu', n: 1 }], base: 0.44, days: 26, reqRealm: 9, desc: '贯通三十六仙窍、踏入玄仙之境。' },
  { id: 'r_jinxian', name: '太乙斩尸丹', out: 'pill_jinxian', outN: 1, inputs: [{ id: 'herb_xian_taiyi', n: 1 }, { id: 'mat_faze_jingsi', n: 2 }, { id: 'mat_hundun_jingyuan', n: 1 }], base: 0.38, days: 32, reqRealm: 10, desc: '辅助玄仙斩落三尸、证太乙金仙。' },
  { id: 'r_daluo', name: '大罗造化丹', out: 'pill_daluo', outN: 1, inputs: [{ id: 'herb_xian_taiyi', n: 2 }, { id: 'mat_hongmeng_zijing', n: 1 }, { id: 'mat_suiyue_jinlu', n: 2 }], base: 0.34, days: 40, reqRealm: 11, desc: '汇聚鸿蒙造化之气，冲刺大罗道果。' },
  { id: 'r_dingxian', name: '定仙镇衰丹', out: 'pill_dingxian_zhenshuai', outN: 1, inputs: [{ id: 'mat_hundun_jingyuan', n: 1 }, { id: 'herb_xian_huijie', n: 1 }, { id: 'mat_suiyue_jinlu', n: 1 }], base: 0.45, days: 25, reqRealm: 9, desc: '化去天人五衰反噬、稳固道果。' },
  { id: 'r_xian_shou', name: '鸿蒙延寿仙丹', out: 'pill_xian_hongmeng_shou', outN: 1, inputs: [{ id: 'mat_hongmeng_zijing', n: 1 }, { id: 'mat_suiyue_jinlu', n: 2 }, { id: 'herb_xian_taiyi', n: 1 }], base: 0.36, days: 35, reqRealm: 9, desc: '增寿两千载，无上仙域续命宝丹。' },
  { id: 'f_leihai_dun', kind: 'forge', name: '紫霄雷翼', out: 'art_leihai_dun', outN: 1, inputs: [{ id: 'mat_leihai_jin', n: 2 }, { id: 'mat_leipenggu', n: 1 }], base: 0.5, days: 35, reqRealm: 5, desc: '以雷海精金重炼飞遁灵宝，极速横渡天渊。' },
  { id: 'f_xuantian_jian', kind: 'forge', name: '玄天斩灵剑', out: 'art_xuantian_jian', outN: 1, inputs: [{ id: 'mat_xuantian_pei', n: 1 }, { id: 'herb_ling_xuanteng', n: 2 }, { id: 'mat_leihai_jin', n: 3 }], base: 0.42, days: 55, reqRealm: 6, desc: '以玄天混沌残胚为骨、玄天仙藤为引炼成灵界杀伐第一至宝。' },
  { id: 'f_xuantian_zhanjia', kind: 'forge', name: '玄天战甲', out: 'art_xuantian_zhanjia', outN: 1, inputs: [{ id: 'mat_ling_zhenlonglin', n: 3 }, { id: 'mat_leihai_jin', n: 2 }, { id: 'mat_ling_xuanyu', n: 3 }], base: 0.48, days: 40, reqRealm: 6, desc: '真龙逆鳞缀甲，万法不侵。' },
  { id: 'f_xuantian_xue', kind: 'forge', name: '踏星步云靴', out: 'art_xuantian_xue', outN: 1, inputs: [{ id: 'mat_ling_kongming', n: 2 }, { id: 'mat_ling_tianfengyu', n: 2 }], base: 0.5, days: 30, reqRealm: 5, desc: '空冥石配天凤羽，踏星穿云。' },
  { id: 'f_taiyi_jian', kind: 'forge', name: '太乙流光仙剑', out: 'art_taiyi_xianjian', outN: 1, inputs: [{ id: 'mat_faze_jingsi', n: 3 }, { id: 'mat_taiyi_xianjin', n: 2 }, { id: 'mat_kuilei_hex', n: 1 }], base: 0.4, days: 45, reqRealm: 9, desc: '融法则晶丝与太乙仙金炼成之本命仙剑。' },
  { id: 'f_yuqing_xianpao', kind: 'forge', name: '玉清仙袍', out: 'art_yuqing_xianpao', outN: 1, inputs: [{ id: 'mat_taiyi_xianjin', n: 2 }, { id: 'herb_xian_taiyi', n: 2 }, { id: 'mat_hongmeng_zijing', n: 1 }], base: 0.42, days: 45, reqRealm: 9, desc: '仙蚕丝配太乙仙金织就，霞光护体。' },
  { id: 'f_suodi_xue', kind: 'forge', name: '缩地成寸仙靴', out: 'art_suodi_xianxue', outN: 1, inputs: [{ id: 'mat_faze_jingsi', n: 2 }, { id: 'mat_ling_kongming', n: 2 }], base: 0.45, days: 35, reqRealm: 9, desc: '空冥神石融大道法则晶丝，一步万里。' },
];

/** v0.70：灵草只看数量——原先「N 年以上」的要求折成株数：五十年左右多一株，百年翻倍，两三百年三倍，千年五倍 */
export function ageToCount(n: number, minAge: number): number {
  if (!minAge) return n;
  const k = minAge >= 1000 ? 5 : minAge >= 200 ? 3 : minAge >= 100 ? 2 : 0;
  return k ? n * k : n + 1;
}
for (const r of RECIPES) for (const i of r.inputs) if (i.minAge) { i.n = ageToCount(i.n, i.minAge); delete i.minAge; }
