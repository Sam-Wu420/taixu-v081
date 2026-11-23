import { XSECTS, OLD_SECT } from './sects';
import { XGONGFA } from './gongfa';
// 第三十七步：货有产地，宝有主人——按原著把“哪里能买到什么、卖多少钱”定死
//
// 原著要点（太虚问道录·人界篇）：
// · 梁国青霞谷坊市（万宝楼）：金蚨子母刃、玄铁飞天盾、天雷子这类上品法器 / 雷火符器；千年灵药一出手就惹眼
// · 定武国天星宗坊市（星辰阁）：阵旗阵盘为主（颠倒五行阵），定颜丹卖到一千多灵石；真正的精品宗门自留
// · 南屏小会：散修以物易物——符箓、残卷、法宝残片、灵草种子
// · 南荒：灵草多、丹方难寻；高阶妖兽几近绝迹——“不要说七级妖丹，就是五级六级妖丹，都是难有人见的东西”
// · 沧溟海：灵药灵石都不丰富，丹方泛滥，妖丹与妖兽材料遍地；五级妖丹近千灵石，六级“可让筑基修士修炼无忧一生”，
//   七级妖丹只在外海拍卖会上露面，价比天高；八级以上是化形妖王的内丹，市面上根本见不到
// · 中州：品类最全、价格最贵；玄京大拍卖会（九霄殿）与魔道地下交换会，元婴老怪拿出来的都是“让结丹修士倾家荡产”的东西
// · 原著里有主的法宝（上官翎的朱雀环、冷天仁的天阳鎏金针、青衍居士的青冥针、穆上师的千重峰、太一门的天阿神剑……）
//   与通天灵宝，坊市拍卖一概不卖——只能杀人夺宝，或走原著机缘
import type { ItemDef } from './items';
import { LOC_BY_ID, type LocDef } from './world';

/** 市集分区：梁国 / 南荒 / 魔门六宗 / 朔漠 / 沧溟海 / 中州 / 天穹草原 / 灵界三域 / 仙界三域 */
export type Zone = 'yue' | 'tiannan' | 'mo' | 'mulan' | 'luanxing' | 'dajin' | 'caoyuan'
  | 'ling_tianyuan' | 'ling_manhuang' | 'ling_leihai'
  | 'xian_beihan' | 'xian_jinyuan' | 'xian_huiyuan';
/** 价区：南荒大陆 / 沧溟海 / 中州（含草原） / 灵界 / 仙界 */
export type PZone = 'TN' | 'LX' | 'DJ' | 'LJ' | 'XJ';
export const ZONE_NAME: Record<Zone, string> = {
  yue: '梁国', tiannan: '南荒', mo: '魔门六宗', mulan: '朔漠', luanxing: '沧溟海', dajin: '中州', caoyuan: '天穹草原',
  ling_tianyuan: '天渊圣域', ling_manhuang: '蛮荒古境', ling_leihai: '无尽雷海',
  xian_beihan: '北寒仙域', xian_jinyuan: '金源仙域', xian_huiyuan: '灰界渊墟',
};
export const pzOf = (z: Zone): PZone => (z === 'luanxing' ? 'LX' : z.startsWith('ling_') ? 'LJ' : z.startsWith('xian_') ? 'XJ' : z === 'dajin' || z === 'caoyuan' ? 'DJ' : 'TN');
export const zonePlane = (z: Zone): 'mortal' | 'spirit' | 'immortal' =>
  z.startsWith('ling_') ? 'spirit' : z.startsWith('xian_') ? 'immortal' : 'mortal';

const ZONE_OF_LOC: Record<string, Zone> = {
  qixuan: 'yue', qingniu: 'yue', jingzhou: 'yue', jiayuan: 'yue', yuejing: 'yue', huangfeng: 'yue', yanyue: 'yue', lingshou: 'yue', qingxu: 'yue', huadao: 'yue', tianque: 'yue', jujian: 'yue', tainan: 'yue', yanling: 'yue',
  yuanwu: 'tiannan', cheqi: 'tiannan', zijin: 'tiannan', luoyun: 'tiannan', gujian: 'tiannan', baiqiao: 'tiannan', tiantian: 'tiannan', huayi: 'tiannan', qianzhu: 'tiannan',
  guiling: 'mo', hehuan: 'mo', yuling: 'mo', qianhuan: 'mo', tiansha: 'mo', yinluo: 'mo',
  mulan: 'mulan', tianlan: 'caoyuan', tuwu: 'caoyuan',
  jinjing: 'dajin', youzhou: 'dajin', yunzhou: 'dajin', qinzhou: 'dajin', xiangzhou: 'dajin', shuozhou: 'dajin',
  tianmo: 'dajin', taiyi: 'dajin', yejia: 'dajin', jin_fangshi: 'dajin', caojia: 'dajin', kunwu: 'dajin', yinyang: 'dajin',
  tianxing: 'luanxing', kuixing: 'luanxing', jiyin: 'luanxing', miaoyin: 'luanxing', biling: 'luanxing', leikong: 'luanxing',
  xiaohuan: 'luanxing', huangming: 'luanxing', qiyuan: 'luanxing', wuzhong: 'luanxing', haiyuan: 'luanxing', waihai: 'luanxing',
};
const zoneCache = new Map<string, Zone>();
/** 地点所在的市集分区（小村落归最近的大地点） */
export function zoneOfLoc(l: LocDef | undefined | null): Zone {
  if (!l) return 'tiannan';
  const c = zoneCache.get(l.id); if (c) return c;
  let z: Zone | undefined = ZONE_OF_LOC[l.id];
  if (!z) {
    if (l.map === 'lingjie') {
      z = l.y < 700 ? 'ling_leihai' : l.x < 1060 ? 'ling_manhuang' : 'ling_tianyuan';
    } else if (l.map === 'xianjie') {
      z = (l.x < 880 && l.y < 820) ? 'xian_beihan' : l.x >= 1700 ? 'xian_huiyuan' : 'xian_jinyuan';
    } else if (l.map === 'renjie') {
      if (l.ox >= 630 && l.oy >= 290) z = 'luanxing';
      else if (l.oy < 262) z = 'dajin';
      else if (l.oy < 368 && l.ox >= 60 && l.ox <= 660) z = l.oy < 312 ? 'caoyuan' : 'mulan';
    }
    if (!z) {
      let best = Infinity;
      for (const id in ZONE_OF_LOC) { const o = LOC_BY_ID.get(id); if (!o || o.map !== l.map) continue; const d = Math.hypot(o.x - l.x, o.y - l.y); if (d < best) { best = d; z = ZONE_OF_LOC[id]; } }
    }
  }
  zoneCache.set(l.id, z ?? 'tiannan');
  return z ?? 'tiannan';
}

/** 流通等级：0 处处有 · 1 村镇坊市 · 2 城池 · 3 大城/宗门/大岛 · 4 只上拍卖会 · 5 不卖（机缘 / 杀人夺宝） */
export type Grade = 0 | 1 | 2 | 3 | 4 | 5;
interface Rule {
  /** 只在这些分区流通（缺省 = 各处都有） */
  z?: (Zone | PZone)[];
  g: Grade;
  /** 原著持有者（有主之宝，一概不卖、也不会从路人身上掉出来） */
  owner?: string;
  /** 宗门秘传：只在这些宗门的藏经阁 / 宝库里换得到 */
  homes?: string[];
  /** 价区倍率 */
  m?: Partial<Record<PZone, number>>;
  /** 第四十步：只在档次 ≥ minLv 的地方露面（4 大城坊市 · 5 名城坊市 / 雄城拍卖会 · 6 天下名城拍卖会） */
  minLv?: number;
}
const TN: PZone = 'TN', LX: PZone = 'LX', DJ: PZone = 'DJ';

// ---------------------------------------------------------------- 原著有主之宝 / 天下独一份
const OWNED: Record<string, string> = {
  art_qingzhu: '苏寒', art_sanyan: '苏寒', art_leihuogong: '苏寒', mat_jinleizhu: '苏寒',
  art_zhuque: '上官翎', art_zhuxie: '上官翎',
  art_tianyang: '冷天仁（九幽极圣一脉）', art_huanglin: '赤胡子', art_zibing: '赤胡子',
  art_qingmingzhen: '青衍居士', art_guanrijian: '星罗殿执法长老', art_yuanci: '星罗殿（元磁神山）', art_xuanhuangjing: '万法门', art_liangyihuan: '玄黄老人',
  art_yufengche: '穆上师', art_qianchongfeng: '穆上师', art_jingangzhao: '炫烨王', art_luohunsha: '狂沙上人', art_sifangxue: '四散真人', art_molongren: '上古魔修（魔龙刃）',
  art_fenglei: '风希', mat_leipenggu: '风希', art_guiluo: '幽罗宗（十八杆鬼罗幡）', art_tiandu: '魔道老怪', art_sanshen: '魔道老怪',
  art_xutian: '归墟殿', art_qianlan: '归墟殿', art_wuxing: '归墟殿', art_huolan: '归墟殿', pill_butian: '归墟殿', tal_liuding: '归墟殿',
  art_wuzi: '封魔山', art_balingchi: '封魔山', art_heifengqi: '封魔山', mat_yinchi: '封魔山（银翼夜叉）', mat_xueyan: '陨魔谷（古魔血焰）',
  art_zhenhaizhong: '寒极宫', mat_shuanggongdu: '寒极宫（六翼霜蚣）', art_tianajian: '太一门',
  mat_jinjiaolin: '十级金蛟王', mat_bingfengyu: '冰凤', item_yuanqi: '上古遗物',
  herb_jiuqu: '万年灵物', pill_jiuqu: '万年灵物', egg_shijin: '蚀金蛊（天下难寻）', item_tihun: '上古异兽（啸魂）',
  mat_huochan: '陨魔谷（火蟾兽）', mat_mangpi: '陨魔谷（蟒兽）',
  // 原著独门功法 / 秘术：只能靠机缘
 
  scroll_art_qianlan: '寒极宫', scroll_art_bixie: '苏寒（金雷竹）', scroll_art_jinlei: '苏寒（金雷竹）',
  scroll_art_fengleichi: '风希',
  scroll_art_dageng: '青霄剑诀（苏寒）', scroll_art_shijin: '蚀金蛊', scroll_art_tihun: '啸魂兽', scroll_art_wuzi: '封魔山',
  scroll_art_xutianding: '归墟鼎', scroll_art_dongxuan: '上古秘术', scroll_art_shengmo: '上古魔功', scroll_art_quhun: '邹大夫（傀魂）', scroll_art_tiandushihuo: '魔道老怪',
};

// ---------------------------------------------------------------- 逐件规则（未列出的按类别 / 品阶推断）
const R: Record<string, Rule> = {
  // —— 法器（梁国青霞谷坊市万宝楼：金蚨子母刃、玄铁飞天盾、天雷子） ——
  art_jinfu: { z: ['yue', 'tiannan'], g: 2 }, art_xuantie: { z: ['yue', 'tiannan'], g: 2 }, tal_tianleizi: { z: ['yue', 'tiannan', DJ], g: 2 },
  art_qingfeng: { g: 1 }, art_yinhui: { g: 1 }, art_qingning: { g: 1 }, art_hongxian: { g: 2 },
  art_guike: { g: 1, m: { LX: 0.7 } },
  art_tayun: { z: [TN], g: 2 },
  // 墨蛟（赤霄禁地）的爪、鳍、眼炼成的法器——南荒货
  art_wulong: { z: [TN], g: 2 }, art_shenfeng: { z: [TN], g: 2 }, art_qingjiao: { z: [TN], g: 2 },
  art_huangluosan: { z: [TN, DJ], g: 3 }, art_wuxingzhen: { g: 3 }, art_yueyang: { g: 3 },
  art_xuehongling: { z: ['yue'], g: 3, homes: ['qingxu'] },          // 清微门的飞行法器
  art_fengyunfan: { z: ['yue'], g: 3, homes: ['huangfeng'] },        // 青霞谷黄师叔的风云幡
  art_lvhuang: { z: ['mo'], g: 3, homes: ['yuling'] },               // 役灵宗修士的法宝
  art_miemo: { z: [TN, DJ], g: 3 },
  art_juhunbo: { z: ['mo', DJ, 'luanxing'], g: 3 },                 // 邪修之物
  art_xueleizi: { z: ['mo', DJ], g: 4 }, art_xuemo: { z: ['mo', DJ], g: 4 },   // 魔道地下拍卖
  art_pingtianchi: { z: [DJ], g: 4 }, art_sixiang: { z: [DJ], g: 4 },
  art_bamen: { z: [LX], g: 4 },                                      // 天镜散人八门金光镜的仿品
  art_yinzhong: { z: [LX], g: 4 }, art_languang: { z: [LX], g: 4 },  // 海外古宝
  art_qingtong: { z: [TN, DJ], g: 4 }, art_ziyou: { z: [DJ, TN], g: 4 }, art_xuepifeng: { z: [DJ, 'mo'], g: 4 },
  art_fuguang: { z: [TN, DJ], g: 4 }, art_jianfu: { z: [TN, DJ], g: 4 }, art_jinguangzhuan: { z: [TN], g: 4 },   // 符宝难得
  // —— 第三十九步：大路法器的产地
  art_heisha: { z: ['mo', DJ, 'luanxing'], g: 2 }, art_shehun: { z: ['mo', DJ, 'luanxing'], g: 1 }, art_xuehun: { z: ['mo', DJ], g: 3 },   // 魔道之物
  art_zijinbo: { z: [DJ, TN], g: 3 },                                // 佛门俗家
  art_ruanwei: { g: 1, m: { LX: 0.75 } }, art_xuangui: { g: 2, m: { LX: 0.75, TN: 1.2 } },   // 妖兽材料炼的甲，海外便宜
  art_xuanbingjing: { z: [DJ, LX], g: 3 }, art_hanjiang: { z: [DJ, LX, 'yue'], g: 2 },
  art_taomu: { g: 0 }, art_feihuang: { g: 0 }, art_chitong: { g: 0 },
  art_gengjin: { g: 3, m: { DJ: 0.9 } }, art_zhenyue: { z: [TN, DJ], g: 3 }, art_tianluo: { z: [DJ, LX], g: 3 },
  scroll_art_shihun: { z: ['mo', DJ, 'luanxing'], g: 3, homes: ['guiling', 'yinluo', 'tianmo'] },
  scroll_art_yinfeng: { z: ['mo', DJ, 'luanxing'], g: 2 },
  scroll_art_hualong: { g: 4, homes: ['tianlan', 'tianmo'] },
  scroll_art_jianhe: { g: 4, homes: ['jujian', 'gujian'] },
  // —— 符箓 ——
  tal_fire: { g: 0 }, tal_ice: { g: 1 }, tal_jingang: { g: 1 }, tal_thunder: { g: 2 }, tal_escape: { g: 2 }, tal_tishen: { g: 3 }, tal_fubao: { g: 4, z: [TN, DJ] },
  tal_pojin: { g: 1 }, tal_huifu: { g: 1 },
  // —— 丹药 ——
  pill_juqi: { g: 0 }, pill_huiqi: { g: 0 }, pill_liaoshang: { g: 0 }, pill_huanglong: { g: 1 }, pill_jinsui: { g: 1 },
  pill_juling: { g: 2 }, pill_ningyuan: { g: 3 },
  pill_dingyan: { z: [TN, DJ], g: 3 },                               // 天星宗星辰阁一千多灵石
  pill_zhuji: { g: 4, m: { TN: 1.4, LX: 0.8 } },                     // 南荒七派把持；海外略松（大城丹铺偶见，见 SPECIAL）
  pill_jiangchen: { z: [LX, DJ], g: 4 },                             // 降尘丹（沧溟海古长老身上就有一颗）
  pill_biyan: { z: [LX], g: 4 },
  pill_peiying: { z: [DJ, LX], g: 4 }, pill_yanshou: { g: 4 }, pill_yanghun: { z: [DJ, LX], g: 3 },
  // —— 灵草：南荒灵药多，沧溟海灵药少而贵 ——
  herb_xuejing: { z: [TN], g: 2 }, herb_nichang: { z: [TN], g: 2 }, herb_bingpo: { z: [DJ, LX], g: 3 }, herb_xuelian: { z: [DJ, TN], g: 2 },
  herb_yangshen: { g: 4 },
  // —— 妖兽材料 ——
  mat_shuangtongmu: { z: [TN], g: 1 }, mat_zhijiao: { z: [TN], g: 1 }, mat_yunchiyu: { z: [TN], g: 1 }, mat_heilin: { z: [TN], g: 1 },
  mat_mojiaoqi: { z: [TN], g: 2 }, mat_mojiaozhao: { z: [TN], g: 2 }, mat_yinzhima: { z: [TN], g: 4 },
  mat_qianmuyan: { z: [LX], g: 2 }, mat_chihuolin: { z: [LX], g: 4 },
  mat_qingfengjiao: { z: [LX, DJ], g: 4 }, mat_bingjialin: { z: [LX, DJ], g: 4 }, mat_tujiapi: { z: [DJ], g: 4 },
  mat_shisha: { z: ['mo', DJ], g: 3 }, mat_yuanhun: { z: ['mo', DJ], g: 3 },
  mat_dujiaolin: { z: [LX], g: 5 },                                  // 八级毒蛟：只能自己去外海搏命
  mat_yanghunmu: { z: [LX], g: 4 },
  mat_tiejing: { g: 0 }, mat_chitong: { g: 1 }, mat_xuantie: { g: 2 }, mat_lingquan: { g: 1 }, mat_xuanyu: { g: 1 },
  mat_gubaocan: { g: 3 },                                            // 南屏小会上就有法宝残片
  // —— 灵兽 ——
  egg_yunchi: { z: [TN], g: 2 }, egg_huli: { z: [TN], g: 3, homes: ['lingshou'] }, egg_wolf: { z: [TN, DJ], g: 3, homes: ['lingshou', 'yuling'] }, egg_jiao: { z: [LX], g: 4 },
  // —— 功法玉简：大路货各处都有，宗门秘传只在本宗藏经阁 ——
  scroll_changchun: { g: 1 }, scroll_huodan: { g: 0 }, scroll_bingzhui: { g: 1 }, scroll_tianyan: { g: 1 }, scroll_lianqi: { g: 2 }, scroll_leidian: { g: 3 },
  scroll_qingyuan: { g: 5, homes: ['huangfeng'] }, scroll_luoyan: { g: 5, homes: ['huangfeng'] }, scroll_art_luoyan: { g: 5, homes: ['huangfeng'] },
  scroll_art_qingyuanmang: { g: 5, homes: ['huangfeng'] }, scroll_art_hutijiandun: { g: 5, homes: ['huangfeng'] },
  scroll_xuanyin: { g: 5, homes: ['jiyin'] },                        // 玄阴经：玄阴岛
  scroll_tuotian: { g: 5, homes: ['tianmo'] }, scroll_art_tuotian: { g: 5, homes: ['tianmo'] },
  scroll_mingqing: { z: [LX], g: 4 },
  scroll_art_jianying: { g: 5, homes: ['gujian'] }, scroll_art_jujianshu: { g: 5, homes: ['jujian'] },
  scroll_art_kuilei: { g: 5, homes: ['baiqiao', 'qianzhu'] }, scroll_art_yushou: { g: 5, homes: ['lingshou', 'yuling'] },
  scroll_art_diandao: { z: ['tiannan'], g: 3, homes: ['baiqiao'] }, // 定武国天星宗坊市的阵法
  scroll_art_kunzhen: { g: 2 }, scroll_art_juling: { g: 2 },
  scroll_art_mingwang: { z: [DJ], g: 4 }, scroll_art_jinganghou: { z: [DJ], g: 3 }, // 中州佛宗
  scroll_art_beiji: { z: [DJ], g: 4 }, scroll_art_qinxian: { z: [DJ], g: 4 }, scroll_art_ziluo: { z: [DJ], g: 4 },
  scroll_art_qingpan: { g: 4 }, scroll_art_chunli: { z: [LX], g: 4 }, scroll_art_leidun: { g: 4 }, scroll_art_bingpo: { z: [DJ, LX], g: 4 },
  scroll_art_xueying: { z: ['mo', DJ, 'luanxing'], g: 3, homes: ['guiling', 'jiyin'] }, scroll_art_yinhun: { z: ['mo'], g: 3, homes: ['guiling', 'yinluo'] },
  scroll_art_xuelian: { z: ['mo', DJ], g: 4, homes: ['yinluo', 'tianmo'] }, scroll_art_xuedun: { z: ['mo', DJ], g: 3, homes: ['tiansha', 'tianmo', 'guiling'] },
  scroll_art_qingyang: { z: ['mo'], g: 3 },                          // 青阳门魔火
  scroll_art_sanyuan: { g: 4 }, scroll_art_tishen: { g: 3 }, scroll_art_tianleifu: { g: 3 },
  // —— 第四十步：宗门秘传（天衍诀一脉归万竹教、两极磁光归星罗殿观星城、疾风九变 / 匿风术归青玄门、血影遁归玄阴岛；名城拍卖会上偶尔也有）
  scroll_dayan: { g: 4, homes: ['qianzhu'] }, scroll_art_shishen: { g: 3, homes: ['qianzhu'] }, scroll_art_jingshen: { g: 4, homes: ['qianzhu'] },
  scroll_art_wugui: { g: 4, homes: ['qianzhu'] }, scroll_art_dayanchong: { g: 4, homes: ['qianzhu'], minLv: 5 },
  scroll_yuanci: { z: [LX], g: 4, homes: ['tianxing'], minLv: 5 }, scroll_art_yuanci: { z: [LX], g: 4, homes: ['tianxing'], minLv: 5 },
  scroll_art_jifeng: { z: ['yue'], g: 3, homes: ['qixuan'] }, scroll_art_nifeng: { z: ['yue'], g: 2, homes: ['qixuan'] },
  scroll_art_xueyingdun: { z: [LX, 'mo'], g: 4, homes: ['jiyin'] },
  // —— 第四十步：雄城 / 名城拍品
  art_ningguang: { z: [TN], g: 4, minLv: 5 }, art_lanjin: { z: [LX], g: 4, minLv: 5 },
  mat_gengjing: { g: 4, minLv: 5, m: { TN: 1.2, DJ: 1, LX: 1.3 } },        // 庚精：原著镇天城、中州京城拍卖会上都出现过
  herb_tianleizhu: { z: [LX], g: 4, minLv: 6, m: { LX: 1.2 } },            // 天雷竹：清音门之物，观星城大拍卖偶有一截
  // —— 第四十步：元婴期的货——只在雄城（minLv 5）/ 天下名城（minLv 6）露面
  pill_yuanling: { g: 4, minLv: 5 }, pill_wanshou: { g: 4, minLv: 5 }, pill_ningpo: { g: 4, minLv: 5 }, pill_zifu: { g: 4, minLv: 6 },
  art_zixiao: { g: 4, minLv: 5 }, art_xuanming: { z: [LX, DJ], g: 4, minLv: 5 }, art_jiuyanglu: { g: 4, minLv: 6 }, art_shanheyin: { z: [TN, DJ], g: 4, minLv: 5 },
  art_qiankunjing: { g: 4, minLv: 6 }, art_xuanwudun: { g: 4, minLv: 5 }, art_longlinjia: { z: [LX, DJ], g: 4, minLv: 5 }, art_wanhunfan: { z: ['mo', DJ, LX], g: 4, minLv: 5 },
  art_fulongsuo: { g: 4, minLv: 5 }, art_yunxiaozhou: { g: 4, minLv: 6 },
  scroll_art_yingshun: { g: 4, minLv: 5 }, scroll_art_leihai: { g: 4, minLv: 6 }, scroll_art_xuanbingyu: { z: [LX, DJ], g: 4, minLv: 5 }, scroll_art_taixu: { g: 4, minLv: 6 },
  scroll_art_shanhe: { z: [TN, DJ], g: 4, minLv: 5 }, scroll_art_jiuyou: { z: ['mo', DJ, LX], g: 4, minLv: 5 }, scroll_art_wanmu: { g: 4, minLv: 5 }, scroll_art_faxiang: { g: 4, minLv: 5 },
  // —— 灵界 / 仙界货品 ——
  tok_pojie: { z: ['dajin', 'luanxing'], g: 4, minLv: 5 },
  item_dingkongzhu: { z: ['dajin', 'luanxing'], g: 4, minLv: 5 },
  mat_xuantian_pei: { z: ['ling_tianyuan', 'ling_manhuang'], g: 4, minLv: 5 },
  mat_leihai_jin: { z: ['ling_leihai', 'ling_tianyuan'], g: 3 },
  mat_taiyin_sui: { z: ['ling_leihai'], g: 3 },
  mat_tijie_muou: { z: ['ling_manhuang', 'ling_tianyuan'], g: 2 },
  mat_ling_kongming: { z: ['ling_tianyuan', 'ling_manhuang', 'ling_leihai'], g: 2 },
  herb_ling_taiyicao: { z: ['ling_tianyuan', 'ling_manhuang', 'ling_leihai'], g: 1 },
  herb_ling_xuezhizhu: { z: ['ling_manhuang', 'ling_tianyuan'], g: 2 },
  herb_ling_tianxin: { z: ['ling_manhuang', 'ling_tianyuan', 'ling_leihai'], g: 4, minLv: 4 },
  tal_ling_tianlei: { z: ['ling_leihai', 'ling_tianyuan', 'ling_manhuang'], g: 2 },
  pill_lingjing_huiqi: { z: ['ling_tianyuan', 'ling_manhuang', 'ling_leihai'], g: 1 },
  pill_lingjing_liaoshang: { z: ['ling_tianyuan', 'ling_manhuang', 'ling_leihai'], g: 1 },
  pill_huaxu: { z: ['ling_tianyuan', 'ling_manhuang', 'ling_leihai'], g: 2 },
  pill_ningxiang: { z: ['ling_tianyuan', 'ling_manhuang', 'ling_leihai'], g: 3 },
  pill_pojie: { z: ['ling_tianyuan', 'ling_leihai'], g: 4, minLv: 4 },
  art_ling_feijian: { z: ['ling_tianyuan', 'ling_manhuang', 'ling_leihai'], g: 3 },
  art_leihai_dun: { z: ['ling_leihai', 'ling_tianyuan'], g: 4 },
  art_xuantian_jian: { z: ['ling_tianyuan'], g: 4, minLv: 6 },
  art_xuantian_ding: { z: ['ling_tianyuan'], g: 4, minLv: 6 },
  mat_faze_jingsi: { z: ['xian_beihan', 'xian_jinyuan', 'xian_huiyuan'], g: 3 },
  mat_hundun_jingyuan: { z: ['xian_huiyuan', 'xian_jinyuan'], g: 4 },
  mat_kuilei_hex: { z: ['xian_jinyuan', 'xian_beihan'], g: 3 },
  mat_suiyue_jinlu: { z: ['xian_jinyuan'], g: 4 },
  item_canjuan_page: { z: ['xian_jinyuan', 'xian_huiyuan'], g: 5 },
  pill_xian_yunshen: { z: ['xian_beihan', 'xian_jinyuan', 'xian_huiyuan'], g: 1 },
  pill_dingxian_zhenshuai: { z: ['xian_beihan', 'xian_jinyuan', 'xian_huiyuan'], g: 2 },
  pill_zhenxian: { z: ['xian_beihan', 'xian_jinyuan'], g: 2 },
  pill_xuanxian: { z: ['xian_beihan', 'xian_jinyuan'], g: 3 },
  pill_jinxian: { z: ['xian_jinyuan'], g: 4 },
  pill_daluo: { z: ['xian_jinyuan', 'xian_huiyuan'], g: 4 },
  art_taiyi_xianjian: { z: ['xian_jinyuan', 'xian_beihan'], g: 4 },
  art_yuqing_baolian: { z: ['xian_jinyuan', 'xian_beihan'], g: 4 },
  art_xuankong_yunzhou: { z: ['xian_beihan', 'xian_jinyuan'], g: 3 },
};

/** 规则（显式 > 推断） */
// v0.60：新宗门的秘传法术与各派镇派心法只在本宗藏经阁（同脉宗门合并 homes）；散修心法按 wild 定流通等级
const addHome = (k: string, sid: string) => {
  const prev = R[k];
  if (prev) prev.homes = [...new Set([...(prev.homes ?? []), sid])];
  else R[k] = { g: 5, homes: [sid] };
};
for (const s of XSECTS) { addHome('scroll_' + s.gf, s.id); for (const a of s.arts) addHome('scroll_art_' + a, s.id); }
for (const [sid, o] of Object.entries(OLD_SECT)) addHome('scroll_' + o.gf, sid);
for (const g of Object.values(XGONGFA)) if (!g.sect) R['scroll_' + g.id] = { g: Math.max(0, Math.min(4, g.wild ?? 3)) as Grade };
export function ruleOf(it: ItemDef): Rule {
  const r = R[it.id];
  if (r) return r;
  if (OWNED[it.id]) return { g: 5, owner: OWNED[it.id] };
  const t = it.tier;
  switch (it.type) {
    case 'herb': return { g: (t <= 1 ? 1 : t >= 5 ? 5 : t) as Grade, m: { LX: 1.7, DJ: 1.25 } };
    case 'material': return { g: (t <= 1 ? 1 : t >= 5 ? 5 : t) as Grade };
    case 'pill': return { g: (t >= 5 ? 5 : t) as Grade };
    case 'talisman': return { g: (t <= 1 ? 1 : t >= 4 ? 5 : t) as Grade };
    case 'scroll': return { g: (t <= 0 ? 1 : t === 1 ? 2 : t === 2 ? 3 : 4) as Grade };
    case 'artifact': return { g: (t <= 1 ? 1 : t >= 6 ? 5 : Math.min(4, t)) as Grade };
    default: return { g: (it.price > 0 ? Math.max(1, Math.min(5, it.tier)) : 5) as Grade };
  }
}
export function ownerOf(id: string) { return OWNED[id]; }
/** 原著有主 / 独一份：不卖、不随机掉落 */
export function canonOwned(id: string) { return !!OWNED[id]; }

// ---------------------------------------------------------------- 妖丹
export const yaodanLv = (id: string) => (id.startsWith('mat_yaodan') ? parseInt(id.slice(10), 10) || 0 : 0);
/** 各价区、各档次坊市能见到的最高妖丹（rnd 决定最高那一档是否“这个月恰好有货”）
 *  level：1 村镇 · 2 城池 · 3 大城/宗门/大岛 · 4 拍卖会 */
export function yaodanCap(pz: PZone, level: number, rnd: () => number = Math.random): number {
  // 第四十步：雄城 / 名城拍卖会的压轴妖丹更高（七级仍只在外海拍卖会上）
  if (level >= 5) {
    if (pz === 'LX') return level >= 6 ? (rnd() < 0.65 ? 7 : 6) : (rnd() < 0.4 ? 7 : 6);
    if (pz === 'DJ') return level >= 6 ? (rnd() < 0.4 ? 6 : 5) : (rnd() < 0.2 ? 6 : 5);
    return rnd() < (level >= 6 ? 0.35 : 0.2) ? 5 : 4;
  }
  if (pz === 'LX') return level >= 4 ? (rnd() < 0.3 ? 7 : 6) : level >= 3 ? (rnd() < 0.35 ? 6 : 5) : level >= 2 ? 4 : 3;
  if (pz === 'DJ') return level >= 4 ? (rnd() < 0.12 ? 6 : 5) : level >= 3 ? 4 : level >= 2 ? 3 : 2;
  return level >= 4 ? (rnd() < 0.08 ? 5 : 4) : level >= 3 ? 3 : level >= 2 ? 2 : 1;   // 南荒：五级妖丹已是拍卖会上的稀罕物
}
/** 妖丹价区倍率：沧溟海便宜，南荒贵得离谱 */
export function yaodanMul(pz: PZone, lv: number) {
  if (pz === 'LX') return lv <= 4 ? 0.5 : lv === 5 ? 0.8 : lv === 6 ? 1.0 : lv === 7 ? 1.3 : 1.6;
  if (pz === 'DJ') return lv <= 3 ? 1.5 : lv <= 6 ? 2 : 2.6;
  return [1, 2.5, 2.5, 3.5, 4.5, 6, 7, 8, 9, 10, 10][lv] ?? 10;
}

// ---------------------------------------------------------------- 对外接口
/** 价区价格倍率（买卖同用；灵仙界折算为灵晶/仙元石计价） */
export function priceMul(it: ItemDef, z: Zone): number {
  const pz = pzOf(z);
  const lv = yaodanLv(it.id);
  if (lv) return yaodanMul(pz, lv);
  const r = ruleOf(it);
  let m = r.m?.[pz] ?? 1;
  // 未单列的妖兽材料：沧溟海遍地，南荒稀罕
  if (!r.m && it.type === 'material' && /鳞|角|皮|羽|骨|眼|爪|鳍|翅|毒|血肉/.test(it.name)) m = pz === 'LX' ? 0.7 : pz === 'TN' ? 1.3 : 1.1;
  if (pz === 'DJ') m *= 1.15;   // 中州什么都贵一些
  const zp = zonePlane(z);
  if (zp === 'spirit') return m / 60;
  if (zp === 'immortal') return m / 200;
  return m;
}
/** 是否在该分区流通 */
export function inZone(it: ItemDef, z: Zone): boolean {
  const r = ruleOf(it);
  if (!r.z) return true;
  const pz = pzOf(z);
  return r.z.includes(z) || r.z.includes(pz);
}
const MORTAL_ONLY_IN_SPIRIT = new Set([
  'pill_juqi', 'pill_huiqi', 'pill_liaoshang', 'pill_huanglong', 'pill_jinsui', 'pill_juling',
  'pill_zhuji', 'pill_ningyuan', 'pill_jiangchen', 'pill_biyan', 'pill_peiying', 'pill_yuanling', 'pill_zifu',
  'pill_dingyan', 'tok_danuoyi', 'tok_pojie', 'item_dingkongzhu', 'item_shengxian',
]);
function fitsSpiritMarket(it: ItemDef): boolean {
  if (it.plane === 'immortal') return false;
  if (it.plane === 'spirit') return true;
  if (MORTAL_ONLY_IN_SPIRIT.has(it.id)) return false;
  if (it.id === 'tal_pojin' || it.id === 'tal_huifu' || it.id === 'tal_tishen' || it.id === 'tal_fubao') return true;
  if (it.type === 'scroll' || it.type === 'artifact') return it.tier >= 3;
  if (it.type === 'herb' || it.type === 'material') return it.tier >= 3;
  if (it.type === 'pill') return it.tier >= 4 && !it.id.startsWith('pill_'); // 只留灵界自身丹药与少数延寿/养魂奇丹
  return false;
}
/**
 * 坊市 / 拍卖会（档次 level）能否摆出这件货
 * 第四十步：level 统一为“场所档次”——坊市 = 城池档次 1~5（cityTier）；拍卖会 = 3 小城 · 4 大城 · 5 雄城 · 6 天下名城（auctionLevel）
 *   · 流通等级 g ≤ level 才上架（g4 只在 4 档以上：大城坊市少量、雄城名城常见、拍卖会）
 *   · minLv：雄城 / 名城才有的好东西
 *   · 宗门秘传：本宗坊市有；别处只在 4 档以上的拍卖会上偶尔露面
 */
export function sellableAt(it: ItemDef, z: Zone, level: number, yCap?: number, locId?: string, auction = false): boolean {
  if (it.price <= 0 || it.id === 'mat_lingshi' || it.id === 'mat_lingjing' || it.id === 'mat_xianyuan') return false;
  const zp = zonePlane(z);
  if (zp === 'mortal' && (it.plane === 'spirit' || it.plane === 'immortal')) return false;
  if (zp === 'spirit' && !fitsSpiritMarket(it) && it.id !== 'pill_yanshou' && it.id !== 'pill_yanghun' && it.id !== 'pill_wanshou' && it.id !== 'pill_ningpo') return false;
  if (zp === 'immortal' && it.plane !== 'immortal') return false;
  const lv = yaodanLv(it.id);
  if (lv) return zp === 'mortal' && lv <= (yCap ?? yaodanCap(pzOf(z), auction ? level : Math.min(3, level), () => 0.5)) && lv <= 7;
  const r = ruleOf(it);
  if (r.g >= 5 || r.owner || canonOwned(it.id)) return false;
  if (r.minLv && level < r.minLv) return false;
  if (r.homes && !(locId && r.homes.includes(locId)) && !(auction && level >= 4)) return false;
  if (zp === 'spirit') {
    // 灵界专属物按灵界三域限制；下界通用的高阶功法/灵材在灵界可跨区流通
    if (it.plane === 'spirit' && !inZone(it, z)) return false;
  } else if (!inZone(it, z)) return false;
  return zp === 'spirit' && it.plane !== 'spirit' ? Math.max(1, r.g - 1) <= level : r.g <= level;
}
/** 宗门藏经阁 / 宝库可换（本宗秘传 + 本区等级 ≤ 3 的东西） */
export function sectCanOffer(it: ItemDef, sectId: string): boolean {
  const r = ruleOf(it);
  if (canonOwned(it.id)) return false;
  if (r.homes) return r.homes.includes(sectId);
  const z = zoneOfLoc(LOC_BY_ID.get(sectId));
  const zp = zonePlane(z);
  if (zp === 'mortal' && (it.plane === 'spirit' || it.plane === 'immortal')) return false;
  if (zp === 'spirit') {
    if (!fitsSpiritMarket(it)) return false;
    return it.plane === 'spirit' ? r.g <= 3 && inZone(it, z) : r.g <= 4;
  }
  if (zp === 'immortal' && it.plane !== 'immortal') return false;
  return r.g <= 3 && inZone(it, z);
}
/**
 * 第四十步：城池档次（1 村镇 · 2 城池 · 3 大城 · 4 雄城 · 5 天下名城）
 * 原著：中州京城（九霄殿拍卖、天机阁）与沧溟海观星城（星罗殿）是人界最繁华的两处；镇天城是正一盟腹地、南荒第一大城；
 * 摇光岛是外海门户、猎妖人云集；朔州城是中州北方雄城。名城的坊市、拍卖会、坐镇的高人，都远非小城可比。
 */
export const CITY_TIER: Record<string, number> = {
  jinjing: 5, tianxing: 5,
  tiantian: 4, kuixing: 4, shuozhou: 4,
  yuejing: 3, jiayuan: 3, qiyuan: 3, jin_fangshi: 3, youzhou: 3, yunzhou: 3, qinzhou: 3, xiangzhou: 3,
  tianyuan_cheng: 5, yaohuang_cheng: 4, leihai_gang: 4, manhuang_jishi: 3,
  lingxiao_xiancheng: 5, beihan_xiancheng: 4, jinyuan_fang: 4, huiyuan_jishi: 4,
};
export const TIER_NAME = ['', '村镇', '城池', '大城', '雄城', '天下名城'];
export function cityTier(l: LocDef): number {
  if (CITY_TIER[l.id]) return CITY_TIER[l.id];
  if (l.minor) return 1;
  if (l.type === 'city') return l.major ? 3 : 2;
  if (l.type === 'sect') return 3;
  if (l.type === 'isle') return l.major ? 3 : 2;
  return l.id === 'tainan' ? 2 : 1;
}
/** 地点的坊市档次（= 城池档次） */
export function shopLevel(l: LocDef): number { return cityTier(l); }
/** 拍卖会档次：3 小城 · 4 大城 · 5 雄城 · 6 天下名城 */
export function auctionLevel(l: LocDef): number { const t = cityTier(l); return t >= 5 ? 6 : t >= 4 ? 5 : t >= 3 ? 4 : 3; }
