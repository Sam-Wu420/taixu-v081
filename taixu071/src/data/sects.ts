// v0.60「功法满天下」：新增十五座宗门（正 / 魔 / 佛 / 妖 / 中立），连同旧有各派一并定下道统、镇派心法与秘传法术。
// 纯数据、不依赖别的模块——world / town / npc / living / roster / relations / schools / market 各处名单都从这里并入。

export type Dao = 'zheng' | 'mo' | 'fo' | 'yao' | 'zhong';
export const DAO_NAME: Record<Dao, string> = { zheng: '正道', mo: '魔道', fo: '佛门', yao: '妖修', zhong: '中立' };
export const DAO_COLOR: Record<Dao, string> = { zheng: '#3a70b0', mo: '#b02838', fo: '#c08a1a', yao: '#4f9a48', zhong: '#7a7a70' };

/** 玩家自立的宗门在地点表里的 id（world/mysect.ts） */
export const MY_SECT_ID = 'mysect';

export interface XSect {
  id: string; name: string; dao: Dao;
  /** 地图坐标（人界沿用旧版统一坐标；灵界/仙界为所属地图原生宏观坐标） */
  x: number; y: number; map?: import('./worldHierarchy').AnyMapId; island?: number; major?: boolean;
  desc: string;
  robe: string;            // 门人袍色
  n: number; top: number;  // 名册人数、掌门境界（3 结丹 · 4 元婴 · 5 化神 · 6 炼虚 · 7 合体 · 8 大乘 · 9 真仙 · 10 玄仙 · 11 金仙 · 12 大罗）
  ally: string;            // 所属联盟（杀其门人，盟友也记账）
  gf: string;              // 镇派心法（GONGFA id）
  arts: string[];          // 秘传法术（只在本宗藏经阁换得到）
  lib: string[];           // 藏经阁另备的通行法术
  like: string;            // 山门样式沿用哪一派（建筑 / 布局）
  motto: string;
}

export const XSECTS: XSect[] = [
  // ===== 南荒 =====
  { id: 'haoran', name: '浩然阁', dao: 'zheng', x: 350, y: 538, major: true, robe: '#e8e0c8', n: 86, top: 4, ally: '正道盟', gf: 'haoran_jing', like: 'qingxu',
    arts: ['haoran_zhengqi', 'chunqiu_bi', 'zhengqi_ge'], lib: ['huichun', 'jinren', 'dingshen', 'tiebu'], motto: '养吾浩然之气',
    desc: '南荒正道盟魁首之一，门人多是读书养气的儒修。一口浩然正气，百邪辟易。' },
  { id: 'taizhen', name: '太真门', dao: 'zheng', x: 404, y: 540, robe: '#9ab8d0', n: 78, top: 4, ally: '正道盟', gf: 'taizhen_jing', like: 'qingxu',
    arts: ['taizhen_wulei', 'liangyi_jianqi', 'taiqing_huti'], lib: ['zhangxin', 'yinlei', 'yujian', 'huichun'], motto: '太上忘情，真一不二',
    desc: '正道盟道家大派，以五雷正法与两仪剑气闻名南荒，与魔门六宗世代为敌。' },
  { id: 'tianxingzong', name: '天星宗', dao: 'zheng', x: 520, y: 446, robe: '#4a5a9a', n: 48, top: 3, ally: '定武国', gf: 'xingdou_jing', like: 'baiqiao',
    arts: ['xingdou_zhen', 'luoxing', 'suoling_zhen'], lib: ['kunzhen', 'juling', 'feishi'], motto: '周天星斗，尽在一盘',
    desc: '定武国阵道宗门，山门外的坊市以阵旗阵盘出名。门人斗法不多话，先布阵。' },
  { id: 'tianfu', name: '天符门', dao: 'zheng', x: 418, y: 372, robe: '#c8a060', n: 56, top: 3, ally: '列国盟', gf: 'tianfu_jing', like: 'huangfeng',
    arts: ['wanfu_chaozong', 'jinjia_fu', 'bingbao_fu'], lib: ['huoqiufu', 'tianleifu', 'dingshen', 'tishen'], motto: '一符在手，万法随身',
    desc: '列国盟的制符大派，前线法士所用符箓十之六七出自此门。' },
  { id: 'moyan', name: '魔焰门', dao: 'mo', x: 196, y: 536, robe: '#6a2a4a', n: 76, top: 4, ally: '魔门六宗', gf: 'moyan_jing', like: 'guiling',
    arts: ['moyan_fentian', 'youhuo_zhu', 'yanmo_shou'], lib: ['qingyang', 'huoshe', 'yinfeng', 'xuedun'], motto: '魔焰所至，寸草不生',
    desc: '魔道大宗，镇派之术青阳魔火歹毒无比，沾身即燃、非魂飞魄散不熄。' },
  { id: 'xuesha', name: '血煞教', dao: 'mo', x: 140, y: 612, robe: '#5a1010', n: 60, top: 3, ally: '魔门六宗', gf: 'xuesha_jing', like: 'tiansha',
    arts: ['xuesha_daogang', 'xuehe_dafa', 'ranxue'], lib: ['xueying', 'xuedun', 'shihun', 'yinfeng'], motto: '以血养煞，以煞证道',
    desc: '以生灵精血修炼的邪教，教众悍不畏死。正道各派提起来无不切齿。' },
  // ===== 沧溟海 =====
  { id: 'wanfa', name: '万法门', dao: 'zheng', x: 838, y: 606, island: 10, major: true, robe: '#d8d0b0', n: 92, top: 4, ally: '沧溟海正道', gf: 'wanfa_jing', like: 'luoyun',
    arts: ['wanfa_guiyi', 'wuxing_lun', 'bihai_chao'], lib: ['bingzhui', 'huodan', 'fengren', 'dici', 'tengfu', 'shuidan'], motto: '万法归宗',
    desc: '沧溟海正道魁首，门中五行法术无所不包，万大门主已是元婴后期。' },
  { id: 'liulian', name: '六合殿', dao: 'zhong', x: 790, y: 440, island: 9, robe: '#5a7a8a', n: 58, top: 3, ally: '沧溟海商盟', gf: 'liulian_jing', like: 'baiqiao',
    arts: ['fuyao_suo', 'liulian_nu', 'liulian_kui'], lib: ['kuilei', 'yushou', 'shuidan', 'feishi'], motto: '猎妖取丹，童叟无欺',
    desc: '沧溟海六家猎妖世家合立的殿宇，专做妖丹妖材生意，门下猎妖团常年出没外海。' },
  // ===== 中州 =====
  { id: 'leiyin', name: '雷音宗', dao: 'fo', x: 176, y: 140, major: true, robe: '#c89a3a', n: 96, top: 4, ally: '中州佛宗', gf: 'leiyin_jing', like: 'tianlan',
    arts: ['leiyin_hou', 'fumo_quan', 'luohan_quan'], lib: ['jingang', 'xiangjia', 'jinzhong', 'tiebu'], motto: '雷音一响，诸魔退散',
    desc: '中州佛宗之首，金刚法相与雷音狮子吼专克魔功鬼物。寺中僧人多修炼体之术。' },
  { id: 'tianshi', name: '天师府', dao: 'zheng', x: 486, y: 110, robe: '#3a5a8a', n: 84, top: 4, ally: '中州正道', gf: 'tianshi_jing', like: 'taiyi',
    arts: ['zhangjiao_leiyin', 'zhenyao_fu', 'taomu_jian'], lib: ['tianleifu', 'dingshen', 'leiguang', 'huoqiufu'], motto: '敕令天地，役使雷霆',
    desc: '中州正道大派，以符箓雷法镇妖伏魔。历代天师皆是元婴修士。' },
  { id: 'motuo', name: '魔陀山', dao: 'mo', x: 196, y: 92, robe: '#3a2a4a', n: 88, top: 4, ally: '中州魔道', gf: 'motuo_jing', like: 'tianmo',
    arts: ['motuo_shouyin', 'tianmo_wu', 'mosha_jia'], lib: ['xuelian', 'shihun', 'yinhun', 'xuedun'], motto: '魔陀一怒，流血千里',
    desc: '中州十大魔宗之一，山中魔修以大手印与天魔舞横行西北。' },
  { id: 'dusheng', name: '毒圣门', dao: 'mo', x: 560, y: 204, robe: '#3a5a2a', n: 54, top: 3, ally: '中州魔道', gf: 'dusheng_jing', like: 'yuling',
    arts: ['wandu_zhang', 'fugu_zhen', 'bilin_zhang'], lib: ['yinfeng', 'tengfu', 'yinhun'], motto: '毒之一道，亦可通神',
    desc: '中州魔宗，门人浑身是毒。门中万毒真经炼到深处，吐气成瘴。' },
  { id: 'xiaoji', name: '寒极宫', dao: 'zhong', x: 368, y: 84, major: true, robe: '#c0e0f0', n: 62, top: 4, ally: '北夜', gf: 'xiaoji_jing', like: 'yanyue',
    arts: ['jihan_bingyan', 'bingfeng_qianli', 'hanyu_jian'], lib: ['bingzhui', 'hanbing', 'xuanbing', 'shuangren', 'shuidan'], motto: '极寒之地，自有洞天',
    desc: '北寒雪原上的隐世宫门，冰系功法冠绝人界。宫中镇海钟与六翼霜蚣威名远播。' },
  { id: 'wanyao', name: '万妖谷', dao: 'yao', x: 668, y: 170, robe: '#5a6a2a', n: 70, top: 4, ally: '万妖谷', gf: 'wanyao_jing', like: 'lingshou',
    arts: ['yaohua_bian', 'wanshou_ben', 'quhu_shu'], lib: ['yushou', 'tengfu', 'qingmu', 'feisha'], motto: '妖亦有道',
    desc: '化形妖修与驭兽修士共居的山谷，谷主乃十级化形大妖。人妖混修，不问出身。' },
  { id: 'jiuxian', name: '九霄宫', dao: 'zheng', x: 420, y: 104, robe: '#e0b8d0', n: 66, top: 4, ally: '中州正道', gf: 'jiuxian_jing', like: 'yanyue',
    arts: ['jiuxian_jianwu', 'huanyue_fenshen', 'liuyun_feixiu'], lib: ['yujian', 'huichun', 'mihun', 'yufeng'], motto: '九天之上，玉女临凡',
    desc: '中州正道女修宫门，剑舞与幻术并称双绝。宫中弟子下山历练，常引得一路风波。' },
  // ===== 灵界 · 风元大陆 / 天渊圣域（东境） =====
  { id: 'taichu_sg', name: '太初圣宫', dao: 'zheng', x: 2880, y: 1440, map: 'lingjie', major: true, robe: '#e6eef8', n: 120, top: 8, ally: '天渊人妖盟', gf: 'taichu_jianjing', like: 'taiyi',
    arts: ['tianxuan_jian', 'taixu', 'faxiang'], lib: ['yujian', 'juling', 'huichun'], motto: '太初一剑，万法归源',
    desc: '风元大陆天渊圣域人族第一圣宗，门中大乘圣祖坐镇圣宫，剑阵守护天渊东疆万年不失。' },
  { id: 'yaohuang_dian', name: '妖皇殿', dao: 'yao', x: 3090, y: 1770, map: 'lingjie', major: true, robe: '#6ca85a', n: 110, top: 8, ally: '天渊人妖盟', gf: 'wanyao_jing', like: 'lingshou',
    arts: ['faxiang', 'wanmu', 'yaohua_bian'], lib: ['yushou', 'tengfu', 'qingmu'], motto: '万妖朝宗，共镇天渊',
    desc: '风元大陆妖族至高圣殿，真灵血脉大妖云集，与人族结成两族大联盟共抗异族。' },
  { id: 'qingming_gz', name: '青冥鬼宗', dao: 'mo', x: 2490, y: 2010, map: 'lingjie', robe: '#3a4a5e', n: 90, top: 7, ally: '灵界阴冥', gf: 'fanmo_baojue', like: 'guiling',
    arts: ['jiuyou', 'fumo_jinlei'], lib: ['shihun', 'yinhun', 'xuedun'], motto: '青冥九转，鬼神莫测',
    desc: '风元大陆南境阴冥鬼道大宗，虽行诡谲炼魂鬼道，凡遇异族犯境却绝不退缩半步。' },
  { id: 'leiyin_gs', name: '雷音古刹', dao: 'fo', x: 3240, y: 1410, map: 'lingjie', robe: '#d8a642', n: 95, top: 7, ally: '天渊人妖盟', gf: 'leiyin_jing', like: 'tianlan',
    arts: ['fumo_jinlei', 'leiyin_hou'], lib: ['jingang', 'jinzhong', 'tiebu'], motto: '一念伏魔，金雷净世',
    desc: '风元大陆佛宗祖庭，殿内供奉辟邪金雷舍利，专克魔渊与蛮荒阴煞异族。' },
  { id: 'tiangong_lg', name: '天工灵阁', dao: 'zhong', x: 2640, y: 1350, map: 'lingjie', robe: '#9aa8b8', n: 85, top: 7, ally: '天渊人妖盟', gf: 'taichu_jianjing', like: 'baiqiao',
    arts: ['shanhe', 'tianxuan_jian'], lib: ['kuilei', 'feishi'], motto: '百炼千机，造化仿生',
    desc: '掌管天渊城灵舟傀儡、青竹蜂云仿制飞剑与玄天残胚炼制的中立大宗。' },
  // ===== 灵界 · 蛮荒古境（西境） =====
  { id: 'jiaochi_zu', name: '角蚩王庭', dao: 'mo', x: 390, y: 1530, map: 'lingjie', major: true, robe: '#7a2c2c', n: 120, top: 8, ally: '蛮荒百族', gf: 'fanmo_baojue', like: 'tiansha',
    arts: ['faxiang', 'shanhe'], lib: ['xuedun', 'tiebu'], motto: '血脉战魂，踏碎天渊',
    desc: '蛮荒古境夜叉与角蚩强族共立之王庭，善御太古战兽与血脉战阵，常年叩关天渊城。' },
  { id: 'yeying_zu', name: '夜影暗殿', dao: 'mo', x: 840, y: 1920, map: 'lingjie', robe: '#2e2a46', n: 88, top: 7, ally: '蛮荒百族', gf: 'fanmo_baojue', like: 'yinluo',
    arts: ['jiuyou', 'tianxuan_jian'], lib: ['shihun', 'yinfeng'], motto: '影落无声，夺魂千里',
    desc: '隐匿于蛮荒影族领地的刺杀圣殿，门下炼虚影卫潜行无踪、专猎天渊哨探。' },
  { id: 'lingmu_zu', name: '灵木圣林', dao: 'yao', x: 630, y: 2115, map: 'lingjie', robe: '#4a7a42', n: 92, top: 7, ally: '蛮荒百族', gf: 'wanyao_jing', like: 'lingshou',
    arts: ['wanmu', 'taiyin_bingpo'], lib: ['tengfu', 'huichun'], motto: '万木生息，毒瘴弥天',
    desc: '万木毒瘴深处的木族王庭，守护着灵界最多万年血灵芝与替劫养魂神木。' },
  // ===== 灵界 · 雷鸣大陆与广寒碎域（北境） =====
  { id: 'guanghan_sy', name: '广寒仙殿', dao: 'zheng', x: 2070, y: 255, map: 'lingjie', major: true, robe: '#bfe8f8', n: 96, top: 8, ally: '灵界极北盟', gf: 'xiaoji_jing', like: 'yanyue',
    arts: ['taiyin_bingpo', 'xuanbingyu'], lib: ['bingzhui', 'hanbing', 'shuidan'], motto: '冰魄照心，万劫不动',
    desc: '广寒碎域万年冰原之上的玄冰圣殿，镇守着太阴寒髓与广寒界核心秘境。' },
  { id: 'leihai_dian', name: '紫霄雷殿', dao: 'zhong', x: 2010, y: 495, map: 'lingjie', robe: '#7256b8', n: 86, top: 7, ally: '灵界极北盟', gf: 'taichu_jianjing', like: 'tianmo',
    arts: ['fumo_jinlei', 'shanhe'], lib: ['leiguang', 'yinlei'], motto: '以雷淬躯，逆天而行',
    desc: '建于雷鸣大陆聚雷群岛之巅的雷道大宗，门人以九霄神雷淬炼真元，最擅炼制雷海精金重宝。' },
  // ===== 仙界 · 北寒 / 金源 / 灰界 =====
  { id: 'guanghan_xg', name: '广寒仙阁', dao: 'zheng', x: 380, y: 270, map: 'xianjie', major: true, robe: '#d4f0ff', n: 105, top: 10, ally: '玉皇仙序', gf: 'xuanqing_dao', like: 'yanyue',
    arts: ['taiyin_bingpo', 'taiyi_jianjue'], lib: ['bingzhui', 'hanbing'], motto: '清寒映道，素心长存',
    desc: '北寒仙域最负盛名的清修仙宗，收留初飞升且道心稳固的真仙散修。' },
  { id: 'beihan_sanxiu', name: '北寒仙盟', dao: 'zhong', x: 640, y: 480, map: 'xianjie', robe: '#7898b0', n: 95, top: 10, ally: '北寒仙域', gf: 'xuanqing_dao', like: 'baiqiao',
    arts: ['tianxuan_jian', 'fumo_jinlei'], lib: ['yujian', 'huichun'], motto: '极渊求存，互守仙脉',
    desc: '北寒散仙结成的互助盟会，掌控北寒多条下品仙晶矿脉。' },
  { id: 'yuhuang_xg', name: '玉皇仙宫', dao: 'zheng', x: 1280, y: 800, map: 'xianjie', major: true, robe: '#f5dc96', n: 140, top: 12, ally: '玉皇仙序', gf: 'xuanqing_dao', like: 'taiyi',
    arts: ['taiyi_jianjue', 'suiyue_jianying'], lib: ['jinzhong', 'faxiang'], motto: '玉皇敕令，统御万域',
    desc: '金源仙域至高仙庭，颁行《斩仙榜》律令，大罗金仙坐镇凌霄殿。' },
  { id: 'taiyi_jt', name: '太乙剑庭', dao: 'zheng', x: 1480, y: 740, map: 'xianjie', major: true, robe: '#eef4ff', n: 125, top: 12, ally: '玉皇仙序', gf: 'taiyi_hunyuan', like: 'qingxu',
    arts: ['taiyi_jianjue', 'tianxuan_jian'], lib: ['yujian', 'taixu'], motto: '一剑斩三尸，太乙证混元',
    desc: '仙界第一剑修圣地，剑庭内藏斩三尸秘传与太乙破法剑气。' },
  { id: 'lunhui_gd', name: '轮回古殿', dao: 'zhong', x: 1060, y: 1180, map: 'xianjie', robe: '#8e74b8', n: 100, top: 11, ally: '金源中立', gf: 'suiyue_tianshu', like: 'tianlan',
    arts: ['suiyue_jianying', 'jiuyou'], lib: ['shihun', 'wanmu'], motto: '六道轮转，一念往生',
    desc: '执掌灵魂与轮回法则的隐秘古殿，传闻连下界亡魂亦可借其秘法召回。' },
  { id: 'huijie_sl', name: '蚀道神宗', dao: 'mo', x: 2040, y: 1120, map: 'xianjie', major: true, robe: '#544a42', n: 110, top: 12, ally: '灰界蚀道', gf: 'fanmo_baojue', like: 'tianmo',
    arts: ['suiyue_jianying', 'jiuyou'], lib: ['xuedun', 'shihun'], motto: '诸仙皆朽，唯灰永存',
    desc: '盘踞灰界渊墟的堕落仙宗，驾驭灰煞潮汐与时空乱流劫掠金源仙脉。' },
];

/** 旧有各派的道统与镇派心法（心法卷轴一并进本宗藏经阁） */
export const OLD_SECT: Record<string, { dao: Dao; gf: string }> = {
  qixuan: { dao: 'zhong', gf: 'qixuan_xf' },
  huangfeng: { dao: 'zheng', gf: 'huangfeng_xj' }, yanyue: { dao: 'zheng', gf: 'sunv_lh' }, lingshou: { dao: 'zheng', gf: 'yushou_zj' }, qingxu: { dao: 'zheng', gf: 'qingxu_xg' },
  huadao: { dao: 'zheng', gf: 'huadao_j' }, tianque: { dao: 'zheng', gf: 'tianque_zy' }, jujian: { dao: 'zheng', gf: 'jujian_xj' },
  luoyun: { dao: 'zheng', gf: 'luoyun_cs' }, gujian: { dao: 'zheng', gf: 'gujian_xj' }, baiqiao: { dao: 'zheng', gf: 'baiqiao_jg' },
  guiling: { dao: 'mo', gf: 'guiling_xs' }, hehuan: { dao: 'mo', gf: 'hehuan_mf' }, yuling: { dao: 'mo', gf: 'yuling_j' }, qianhuan: { dao: 'mo', gf: 'qianhuan_mg' },
  tiansha: { dao: 'mo', gf: 'tiansha_xg' }, yinluo: { dao: 'mo', gf: 'yinluo_gj' },
  huayi: { dao: 'zheng', gf: 'huayi_xf' }, qianzhu: { dao: 'zhong', gf: 'qianzhu_lj' }, tianlan: { dao: 'zhong', gf: 'tianlan_sd' },
  tianmo: { dao: 'mo', gf: 'tianmo_df' }, taiyi: { dao: 'zheng', gf: 'taiyi_hq' },
  // v0.61：名册上有、却一直没有镇派心法的五派补齐
  mulan: { dao: 'zhong', gf: 'mulan_fj' }, yejia: { dao: 'zheng', gf: 'yejia_xf' }, tianxing: { dao: 'zhong', gf: 'xingchen_j' }, leikong: { dao: 'mo', gf: 'nixing_j' }, miaoyin: { dao: 'zhong', gf: 'miaoyin_xj' },
};

// ---------------------------------------------------------------- v0.61「宗门争锋」/ v0.72「万人金字塔」
export type Scale = 'da' | 'zhong' | 'xiao';
export const SCALE_NAME: Record<Scale, string> = { da: '大宗门', zhong: '中宗门', xiao: '小宗门' };
export interface SectPyramid { servant: number; outer: number; mid: number; top: number }
/** 各等宗门的三层编制基数：
 *  · top：掌门 + 太上长老 + 结丹长老 + 核心执事（实名/核心层）
 *  · mid：筑基期中坚（种子池 / 战阵阵眼）
 *  · outer：外门炼气 6–13 层（百人战阵主力兵源）
 *  · servant：杂役炼气 1–5 层（后勤，不参战） */
export const SECT_PYRAMID: Record<Scale, SectPyramid> = {
  da: { servant: 48000, outer: 26000, mid: 420, top: 24 },
  zhong: { servant: 19000, outer: 11000, mid: 180, top: 16 },
  xiao: { servant: 7800, outer: 4200, mid: 75, top: 10 },
};
/** 门人总规模上限（《凡人修仙传》体量）：大宗门 ~7.5万–10万 · 中宗门 ~2.6万–4万 · 小宗门 ~1万–1.6万 */
export const SCALE_CAP: Record<Scale, number> = { da: 100000, zhong: 40000, xiao: 16000 };
/** 名声在外的十二家是大宗门；偏居一隅的十家是小宗门；其余皆为中宗门 */
const BIG = ['yanyue', 'luoyun', 'guiling', 'hehuan', 'yinluo', 'tianmo', 'taiyi', 'tianxing', 'leikong', 'haoran', 'wanfa', 'leiyin',
  'taichu_sg', 'yaohuang_dian', 'jiaochi_zu', 'guanghan_sy', 'guanghan_xg', 'yuhuang_xg', 'taiyi_jt', 'huijie_sl'];
const SMALL = ['qingxu', 'huadao', 'tianque', 'jujian', 'qianzhu', 'miaoyin', 'tianxingzong', 'tianfu', 'liulian', 'dusheng',
  'yeying_zu', 'beihan_sanxiu'];
export const SECT_SCALE: Record<string, Scale> = {};
for (const id of BIG) SECT_SCALE[id] = 'da';
for (const id of SMALL) SECT_SCALE[id] = 'xiao';
/** 一派的规模（没登记的——比如模组宗门——按名册人数估） */
export function scaleOf(id: string, n?: number): Scale {
  if (SECT_SCALE[id]) return SECT_SCALE[id];
  if (n === undefined) return 'zhong';
  if (n >= 1500) return n > 42000 ? 'da' : n >= 18000 ? 'zhong' : 'xiao';
  return n > 200 ? 'da' : n >= 70 ? 'zhong' : 'xiao';
}
/** 按原基数与规模算出细化金字塔编制（保留各派微幅差异，并严格受限于 SCALE_CAP） */
export function pyramidOf(id: string, baseN = 80, topRealm = 4): SectPyramid {
  const s = scaleOf(id, baseN), P = SECT_PYRAMID[s], cap = SCALE_CAP[s];
  const ref = s === 'da' ? 105 : s === 'zhong' ? 72 : 42;
  const k = Math.max(0.8, Math.min(1.15, baseN / ref));
  const top = Math.max(8, Math.min(30, Math.round(P.top * (0.9 + 0.1 * k)) + (topRealm >= 9 ? 4 : topRealm >= 5 ? 3 : topRealm >= 4 ? 1 : 0)));
  const mid = Math.round(P.mid * k);
  let outer = Math.round(P.outer * k);
  let servant = Math.round(P.servant * k);
  const sum = top + mid + outer + servant;
  if (sum > cap) {
    const ratio = (cap - top - mid) / Math.max(1, outer + servant);
    outer = Math.max(1, Math.floor(outer * ratio));
    servant = Math.max(1, cap - top - mid - outer);
  }
  return { servant, outer, mid, top };
}
/** 宗门总人数（四层之和），不超过规模上限 */
export function scaledSize(id: string, n: number): number {
  const s = scaleOf(id, n), p = pyramidOf(id, n);
  return Math.min(SCALE_CAP[s], p.servant + p.outer + p.mid + p.top);
}

export const X_BY_ID: Record<string, XSect> = Object.fromEntries(XSECTS.map((s) => [s.id, s]));
/** 新增的魔道宗门 id */
export const X_DEMON: string[] = XSECTS.filter((s) => s.dao === 'mo').map((s) => s.id);
export const X_ROBE: Record<string, string> = Object.fromEntries(XSECTS.map((s) => [s.id, s.robe]));
/** 一派的道统（新旧通查；查不到返回 undefined） */
export function sectDao(id: string | undefined | null): Dao | undefined { return id ? X_BY_ID[id]?.dao ?? OLD_SECT[id]?.dao : undefined; }
/** 一派的镇派心法 id */
export function sectGongfa(id: string | undefined | null): string | undefined { return id ? X_BY_ID[id]?.gf ?? OLD_SECT[id]?.gf : undefined; }
/** 野外行走的修士：各图新宗门（[正 / 中, 魔]） */
export const X_WILD: Record<string, [string[], string[]]> = {
  renjie: [['haoran', 'taizhen', 'tianxingzong', 'tianfu', 'wanfa', 'liulian', 'leiyin', 'tianshi', 'xiaoji', 'jiuxian', 'wanyao'], ['moyan', 'xuesha', 'motuo', 'dusheng']],
  lingjie: [['taichu_sg', 'yaohuang_dian', 'leiyin_gs', 'tiangong_lg', 'lingmu_zu', 'guanghan_sy', 'leihai_dian'], ['qingming_gz', 'jiaochi_zu', 'yeying_zu']],
  xianjie: [['guanghan_xg', 'beihan_sanxiu', 'yuhuang_xg', 'taiyi_jt', 'lunhui_gd'], ['huijie_sl']],
};
