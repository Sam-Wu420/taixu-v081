// v0.60「功法满天下」：新增十五座宗门（正 / 魔 / 佛 / 妖 / 中立），连同旧有各派一并定下道统、镇派心法与秘传法术。
// 纯数据、不依赖别的模块——world / town / npc / living / roster / relations / schools / market 各处名单都从这里并入。

export type Dao = 'zheng' | 'mo' | 'fo' | 'yao' | 'zhong';
export const DAO_NAME: Record<Dao, string> = { zheng: '正道', mo: '魔道', fo: '佛门', yao: '妖修', zhong: '中立' };
export const DAO_COLOR: Record<Dao, string> = { zheng: '#3a70b0', mo: '#b02838', fo: '#c08a1a', yao: '#4f9a48', zhong: '#7a7a70' };

/** 玩家自立的宗门在地点表里的 id（world/mysect.ts） */
export const MY_SECT_ID = 'mysect';

export interface XSect {
  id: string; name: string; dao: Dao;
  /** 旧版统一地图坐标（与 data/world.ts 的 RAW_LOCATIONS 同一套） */
  x: number; y: number; map?: 'tiannan' | 'luanxing' | 'dajin'; island?: number; major?: boolean;
  desc: string;
  robe: string;            // 门人袍色
  n: number; top: number;  // 名册人数、掌门境界（3 结丹 · 4 元婴 · 5 化神）
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
  { id: 'xuesha', name: '血煞教', dao: 'mo', x: 140, y: 612, robe: '#5a1010', n: 60, top: 4, ally: '魔门六宗', gf: 'xuesha_jing', like: 'tiansha',
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
  { id: 'dusheng', name: '毒圣门', dao: 'mo', x: 560, y: 204, robe: '#3a5a2a', n: 54, top: 4, ally: '中州魔道', gf: 'dusheng_jing', like: 'yuling',
    arts: ['wandu_zhang', 'fugu_zhen', 'bilin_zhang'], lib: ['yinfeng', 'tengfu', 'yinhun'], motto: '毒之一道，亦可通神',
    desc: '中州魔宗，门人浑身是毒。门中万毒真经炼到深处，吐气成瘴。' },
  { id: 'xiaoji', name: '寒极宫', dao: 'zhong', x: 368, y: 84, major: true, robe: '#c0e0f0', n: 62, top: 4, ally: '北夜', gf: 'xiaoji_jing', like: 'yanyue',
    arts: ['jihan_bingyan', 'bingfeng_qianli', 'hanyu_jian'], lib: ['bingzhui', 'hanbing', 'xuanbing', 'shuangren', 'shuidan'], motto: '极寒之地，自有洞天',
    desc: '北寒雪原上的隐世宫门，冰系功法冠绝人界。宫中镇海钟与六翼霜蚣威名远播。' },
  { id: 'wanyao', name: '万妖谷', dao: 'yao', x: 668, y: 170, map: 'dajin', robe: '#5a6a2a', n: 70, top: 4, ally: '万妖谷', gf: 'wanyao_jing', like: 'lingshou',
    arts: ['yaohua_bian', 'wanshou_ben', 'quhu_shu'], lib: ['yushou', 'tengfu', 'qingmu', 'feisha'], motto: '妖亦有道',
    desc: '化形妖修与驭兽修士共居的山谷，谷主乃十级化形大妖。人妖混修，不问出身。' },
  { id: 'jiuxian', name: '九霄宫', dao: 'zheng', x: 420, y: 104, robe: '#e0b8d0', n: 66, top: 4, ally: '中州正道', gf: 'jiuxian_jing', like: 'yanyue',
    arts: ['jiuxian_jianwu', 'huanyue_fenshen', 'liuyun_feixiu'], lib: ['yujian', 'huichun', 'mihun', 'yufeng'], motto: '九天之上，玉女临凡',
    desc: '中州正道女修宫门，剑舞与幻术并称双绝。宫中弟子下山历练，常引得一路风波。' },
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

// ---------------------------------------------------------------- v0.61「宗门争锋」：宗门分三等
export type Scale = 'da' | 'zhong' | 'xiao';
export const SCALE_NAME: Record<Scale, string> = { da: '大宗门', zhong: '中宗门', xiao: '小宗门' };
/** 门人上限：大宗门 400 · 中宗门 200 · 小宗门 120 */
export const SCALE_CAP: Record<Scale, number> = { da: 400, zhong: 200, xiao: 120 };
/** 名声在外的十二家是大宗门；偏居一隅的十家是小宗门；其余皆为中宗门 */
const BIG = ['yanyue', 'luoyun', 'guiling', 'hehuan', 'yinluo', 'tianmo', 'taiyi', 'tianxing', 'leikong', 'haoran', 'wanfa', 'leiyin'];
const SMALL = ['qingxu', 'huadao', 'tianque', 'jujian', 'qianzhu', 'miaoyin', 'tianxingzong', 'tianfu', 'liulian', 'dusheng'];
export const SECT_SCALE: Record<string, Scale> = {};
for (const id of BIG) SECT_SCALE[id] = 'da';
for (const id of SMALL) SECT_SCALE[id] = 'xiao';
/** 一派的规模（没登记的——比如模组宗门——按名册人数估） */
export function scaleOf(id: string, n?: number): Scale { return SECT_SCALE[id] ?? (n === undefined ? 'zhong' : n > 200 ? 'da' : n >= 70 ? 'zhong' : 'xiao'); }
/** 旧名册人数按规模放大（大 ×3 · 中 ×1.8 · 小 ×1.5），不超过上限 */
export function scaledSize(id: string, n: number): number { const s = scaleOf(id); return Math.min(SCALE_CAP[s], Math.round(n * (s === 'da' ? 3 : s === 'zhong' ? 1.8 : 1.5))); }

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
  tiannan: [['haoran', 'taizhen', 'tianxingzong', 'tianfu'], ['moyan', 'xuesha']],
  luanxing: [['wanfa', 'liulian'], []],
  dajin: [['leiyin', 'tianshi', 'xiaoji', 'jiuxian', 'wanyao'], ['motuo', 'dusheng']],
};
