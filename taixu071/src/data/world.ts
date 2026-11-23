import { XSECTS } from './sects';
import { HUMAN_REGIONS, LEGACY_HUMAN_MAP_IDS, worldOfMap, WORLDS, type AnyMapId, type LegacyHumanMapId, type WorldId } from './worldHierarchy';
// 人界地理数据
// 坐标系：宏观坐标 1000 x 700，乘以 WORLD_SCALE 得到世界坐标（像素）
// 布局参考原著及网络流传的《太虚问道录》人界地图：
//   北部中州（人界第一大国）→ 中部天穹草原 → 西南南荒（苏寒故乡）→ 南荒以西极西之地
//   南荒以东隔无边海为沧溟海（沧溟内海以观星城为中心，沧溟外海妖兽横行）
// 第十六步起：人界拆为三张独立地图（南荒 / 沧溟海 / 中州）。下面的原始数据仍是“旧版统一地图”的宏观坐标（称为
// legacy 坐标），每张地图按各自的平移 + 缩放把属于自己的部分摊开到整张图上，见文件末尾的 buildMap。
export const WORLD_SCALE = 300;   // 每宏观单位 300 像素（各图一致）

export type P = [number, number];

// 主大陆轮廓（中州 + 天穹草原 + 南荒 + 极西之地）
const RAW_MAINLAND: P[] = [
  [62, 70], [110, 48], [168, 40], [230, 50], [290, 36], [360, 30], [430, 42], [500, 34], [570, 30], [640, 44],
  [700, 52], [748, 72], [782, 104], [792, 140], [770, 168], [744, 186], [752, 212], [742, 240], [712, 262],
  [668, 268], [646, 292], [612, 318], [596, 352], [586, 392], [578, 430], [584, 468], [570, 500], [566, 530],
  [578, 560], [566, 596], [552, 630], [530, 652], [494, 664], [452, 658], [410, 668], [366, 664], [318, 670],
  [276, 662], [236, 668], [196, 656], [160, 640], [130, 618], [112, 630], [86, 626], [52, 612], [30, 580],
  [22, 540], [34, 498], [26, 456], [44, 412], [38, 368], [60, 326], [54, 284], [74, 240], [58, 196], [48, 150], [44, 108],
];

// 内陆湖泊
const RAW_LAKES: { c: P; r: number; name?: string }[] = [
  { c: [420, 175], r: 10, name: '玄湖' },
  { c: [300, 312], r: 7 },
  { c: [470, 598], r: 4 },
  { c: [212, 210], r: 6 },
];

// 山脉（折线 + 宽度 + 高度）
const RAW_RANGES: { pts: P[]; w: number; h: number; name?: string }[] = [
  { pts: [[90, 72], [180, 62], [280, 58], [380, 52], [480, 56], [580, 54], [680, 76]], w: 26, h: 1.0, name: '北寒雪岭' },
  { pts: [[200, 158], [260, 176], [320, 190], [380, 160]], w: 16, h: 0.8 },
  { pts: [[690, 110], [715, 130], [735, 150]], w: 18, h: 1.0, name: '封魔山' },
  { pts: [[540, 120], [580, 150], [600, 210]], w: 14, h: 0.7 },
  { pts: [[150, 244], [240, 252], [350, 240], [470, 254], [580, 248], [650, 262]], w: 14, h: 0.65 },
  { pts: [[118, 392], [108, 440], [112, 500], [104, 560], [118, 612]], w: 18, h: 0.95, name: '南荒西岭' },
  { pts: [[160, 450], [196, 500], [184, 560], [200, 620]], w: 16, h: 0.75 },
  { pts: [[268, 520], [294, 560], [318, 600]], w: 14, h: 0.8, name: '陨魔山' },
  { pts: [[500, 528], [522, 552], [534, 576], [526, 606]], w: 12, h: 0.85, name: '苍岳山脉' },
  { pts: [[430, 470], [460, 488], [500, 486]], w: 9, h: 0.55 },
  { pts: [[220, 378], [320, 372], [420, 380], [540, 376]], w: 10, h: 0.5 },
  { pts: [[60, 470], [70, 520]], w: 10, h: 0.5 },
];

// 河流
const RAW_RIVERS: { pts: P[]; w: number }[] = [
  { pts: [[300, 440], [350, 470], [410, 512], [452, 548], [500, 590], [540, 628], [566, 646]], w: 1.4 },
  { pts: [[468, 520], [480, 560], [492, 600], [510, 640], [520, 664]], w: 1.0 },
  { pts: [[290, 96], [350, 130], [420, 170], [490, 196], [560, 206], [650, 222], [742, 236]], w: 1.6 },
  { pts: [[240, 300], [300, 312], [360, 300], [430, 318], [520, 330], [600, 334]], w: 1.0 },
  { pts: [[180, 470], [230, 520], [260, 600], [276, 662]], w: 1.1 },
  { pts: [[400, 70], [410, 120], [420, 165]], w: 0.9 },
];

// 干旱（草原/荒漠）、严寒、森林区域
const RAW_ARID: { pts: P[]; v: number }[] = [
  { pts: [[190, 262], [640, 262], [620, 368], [210, 372]], v: 0.7 },  // 天穹草原
  { pts: [[60, 120], [190, 130], [200, 240], [70, 236]], v: 1.0 },   // 中州西漠
  { pts: [[25, 520], [100, 520], [100, 615], [35, 600]], v: 0.9 },   // 极西荒漠
];
const RAW_COLD: { pts: P[]; v: number }[] = [
  { pts: [[40, 30], [800, 30], [800, 96], [40, 104]], v: 1.0 },
];
const RAW_FOREST: { pts: P[]; v: number }[] = [
  { pts: [[420, 480], [570, 480], [570, 660], [420, 660]], v: 0.8 },  // 梁国
  { pts: [[250, 430], [420, 430], [420, 660], [250, 660]], v: 0.6 },
  { pts: [[120, 420], [250, 420], [250, 650], [120, 650]], v: 0.55 },
  { pts: [[260, 100], [700, 100], [700, 240], [260, 240]], v: 0.55 }, // 中州腹地
];

// 命名区域（用于显示当前位置；按顺序匹配，越靠前越优先）
export interface Region { id: string; name: string; parent: string; pts: P[]; label?: P; labelSize?: number }
const RAW_REGIONS: Region[] = [
  { id: 'yue', name: '梁国', parent: '南荒', pts: [[425, 495], [575, 495], [580, 670], [425, 670]], label: [500, 640], labelSize: 1 },
  { id: 'yuanwu', name: '定武国', parent: '南荒', pts: [[425, 428], [585, 428], [580, 495], [425, 495]], label: [500, 455], labelSize: 1 },
  { id: 'cheqi', name: '青骊国', parent: '南荒', pts: [[335, 520], [425, 520], [425, 670], [335, 670]], label: [380, 620], labelSize: 1 },
  { id: 'zijin', name: '赤霞国', parent: '南荒', pts: [[335, 428], [425, 428], [425, 520], [335, 520]], label: [375, 440], labelSize: 1 },
  { id: 'tiandao', name: '正一盟', parent: '南荒', pts: [[250, 428], [335, 428], [335, 560], [250, 560]], label: [292, 445], labelSize: 1 },
  { id: 'zhuimo', name: '陨魔谷一带', parent: '南荒', pts: [[250, 560], [335, 560], [335, 670], [250, 670]], label: [290, 640], labelSize: 1 },
  { id: 'modao', name: '魔门六宗', parent: '南荒', pts: [[118, 428], [250, 428], [250, 670], [118, 670]], label: [185, 445], labelSize: 1 },
  { id: 'jiuguo', name: '列国盟', parent: '南荒', pts: [[118, 368], [600, 368], [600, 428], [118, 428]], label: [300, 400], labelSize: 1 },
  { id: 'jixi', name: '极西之地', parent: '极西', pts: [[0, 360], [118, 360], [118, 680], [0, 680]], label: [65, 420], labelSize: 1.3 },
  { id: 'tianlan', name: '天穹草原', parent: '天穹草原', pts: [[60, 255], [680, 255], [660, 312], [60, 312]], label: [390, 286], labelSize: 1.5 },
  { id: 'mulan', name: '朔漠草原', parent: '朔漠草原', pts: [[60, 312], [660, 312], [640, 368], [60, 368]], label: [455, 342], labelSize: 1.5 },
  { id: 'dajin', name: '中州', parent: '中州', pts: [[0, 0], [820, 0], [820, 255], [0, 255]], label: [440, 120], labelSize: 2.4 },
  { id: 'luanxing_inner', name: '沧溟内海', parent: '沧溟海', pts: circlePts(815, 500, 105), label: [815, 560], labelSize: 1.2 },
  { id: 'luanxing_outer', name: '沧溟外海', parent: '沧溟海', pts: [[660, 290], [1030, 290], [1030, 720], [660, 720]], label: [930, 670], labelSize: 1.2 },
  { id: 'wubian', name: '无边海', parent: '无边海', pts: [[560, 260], [660, 260], [660, 720], [560, 720]], label: [610, 470], labelSize: 1.4 },
  { id: 'beihai', name: '北海', parent: '北海', pts: [[-350, -60], [1450, -60], [1450, 290], [-350, 290]], label: [940, 160], labelSize: 1.4 },
];
function circlePts(cx: number, cy: number, r: number): P[] {
  const pts: P[] = [];
  for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  return pts;
}

// 大区域标签（缩小地图时显示的大字）
const RAW_BIG_LABELS: { name: string; at: P; size: number }[] = [
  { name: '中州', at: [430, 140], size: 5 },
  { name: '天穹草原', at: [420, 310], size: 3.2 },
  { name: '南荒', at: [330, 520], size: 4.5 },
  { name: '极西之地', at: [66, 470], size: 2.2 },
  { name: '沧溟海', at: [840, 420], size: 4 },
  { name: '无边海', at: [612, 520], size: 2.4 },
];

// 地点
export type LocType = 'city' | 'town' | 'sect' | 'danger' | 'secret' | 'isle' | 'inn';
export interface LocDef {
  id: string; name: string; type: LocType; x: number; y: number;
  desc: string; major?: boolean; island?: number; // island: 生成岛屿半径（宏观单位）
  scale?: number;
  minor?: boolean;          // 程序生成的小地点（村落 / 洞府 / 妖兽巢穴）
  danger?: number;          // 危险等级 0–5（决定妖兽强弱）
  map: MapId;               // 所在地图
  ox: number; oy: number;   // 旧版统一地图上的坐标（沿用旧的区域规则）
  /** v0.56：模组地点——类型显示名（如「茶寮」）、地图印章字（一个字）、路边小站的样式 */
  label?: string; seal?: string; look?: 'tea' | 'post';
}
type RawLoc = Omit<LocDef, 'map' | 'ox' | 'oy'> & { map?: MapId };

const RAW_LOCATIONS: RawLoc[] = [
  // ===== 梁国 =====
  { id: 'qixuan', name: '青玄门', type: 'sect', x: 505, y: 598, scale: 0.75, major: true, desc: '梁国镜州彩霞山上的江湖门派。苏寒少年时在此做记名弟子，结识邹大夫与方啸云，也是一切的起点。' },
  { id: 'qingniu', name: '白石镇', type: 'town', x: 520, y: 614, desc: '苏寒家乡附近的小镇，民风淳朴。' },
  { id: 'jingzhou', name: '明州城', type: 'city', x: 490, y: 606, desc: '梁国南部州城，青玄门的势力范围。' },
  { id: 'jiayuan', name: '嘉禾城', type: 'city', x: 468, y: 566, major: true, desc: '梁国大城，邹府所在，邹大夫的家眷居于此。' },
  { id: 'yuejing', name: '梁京', type: 'city', x: 482, y: 532, major: true, desc: '梁国京城，凡人繁华之地，暗中亦有修仙坊市。' },
  { id: 'huangfeng', name: '青霞谷', type: 'sect', x: 524, y: 552, major: true, desc: '梁国七派之一，坐落苍岳山脉。苏寒筑基前后所在的宗门，严化尘一脉。' },
  { id: 'yanyue', name: '凝霜宗', type: 'sect', x: 447, y: 518, major: true, desc: '梁国七派之首，女修众多，上官翎出身于此。' },
  { id: 'lingshou', name: '驭兽山', type: 'sect', x: 540, y: 512, desc: '梁国七派之一，擅长驭使灵兽灵虫。' },
  { id: 'qingxu', name: '清微门', type: 'sect', x: 446, y: 602, desc: '梁国七派之一，道家清修之门。' },
  { id: 'huadao', name: '断刀坞', type: 'sect', x: 468, y: 632, desc: '梁国七派之一，以刀修闻名。' },
  { id: 'tianque', name: '天枢堡', type: 'sect', x: 548, y: 584, desc: '梁国七派之一，堡垒森严。' },
  { id: 'jujian', name: '重岳剑门', type: 'sect', x: 452, y: 576, desc: '梁国七派之一，门人多使巨剑。' },
  { id: 'tainan', name: '南屏山', type: 'town', x: 502, y: 516, desc: '散修聚集之地，南屏小会在此举行，可交易法器丹药、打探消息。' },
  { id: 'xuese', name: '赤霄禁地', type: 'secret', x: 486, y: 498, major: true, desc: '梁国七派共管的禁地，每五年开启一次，只许炼气弟子进入。内有筑基丹主药，亦是苏寒与上官翎初遇之地。' },
  { id: 'yanling', name: '鸿翎堡', type: 'town', x: 434, y: 552, desc: '鸿家堡垒，曾举办夺宝大会，南荒各派齐聚。' },
  { id: 'taiyue', name: '苍岳山脉深处', type: 'danger', x: 534, y: 596, desc: '妖兽出没的深山，常有修士入山猎妖采药。' },
  // ===== 定武国 / 青骊国 / 赤霞国 =====
  { id: 'yuanwu', name: '定武城', type: 'city', x: 488, y: 462, desc: '定武国都城，修仙坊市林立。' },
  { id: 'chuansong', name: '灵石矿洞·古传送阵', type: 'secret', x: 497, y: 524, major: true, desc: '梁京城外废弃灵石矿洞深处的上古传送阵。须持“大挪移令”并耗费大量灵石方能开启，可直通沧溟海——' },
  { id: 'cheqi', name: '青骊城', type: 'city', x: 382, y: 590, desc: '青骊国都城。' },
  { id: 'zijin', name: '赤霞城', type: 'city', x: 382, y: 476, desc: '赤霞国都城，商旅往来不绝。' },
  // ===== 正一盟 / 陨魔谷 =====
  { id: 'luoyun', name: '栖云宗', type: 'sect', x: 292, y: 472, major: true, desc: '正一盟三派之一，灵药园闻名南荒。苏寒结婴后曾在此担任长老。' },
  { id: 'gujian', name: '藏剑门', type: 'sect', x: 268, y: 524, desc: '正一盟三派之一，剑修圣地。' },
  { id: 'baiqiao', name: '天工院', type: 'sect', x: 320, y: 506, desc: '正一盟三派之一，擅炼傀儡机关。' },
  { id: 'zhuimo', name: '陨魔谷', type: 'danger', x: 300, y: 592, major: true, desc: '南荒第一凶地，上古魔修陨落之处，内有空间裂缝与古魔残魂。' },
  // ===== 魔门六宗 =====
  { id: 'guiling', name: '阴灵门', type: 'sect', x: 170, y: 470, desc: '魔门六宗之一，驭使鬼物。' },
  { id: 'hehuan', name: '天欢宗', type: 'sect', x: 222, y: 500, desc: '魔门六宗之一，修双修采补之术，门中多妖娆女修。' },
  { id: 'yuling', name: '役灵宗', type: 'sect', x: 160, y: 560, desc: '魔门六宗之一，擅长血祭灵兽。' },
  { id: 'qianhuan', name: '万幻宗', type: 'sect', x: 212, y: 612, desc: '魔门六宗之一，以幻术见长。' },
  { id: 'tiansha', name: '玄煞宗', type: 'sect', x: 176, y: 628, desc: '魔门六宗之一，杀伐果决。' },
  { id: 'yinluo', name: '幽罗宗', type: 'sect', x: 228, y: 560, major: true, desc: '魔门六宗之一，镇宗之宝鬼罗幡以数十万生魂祭炼。' },
  // ===== 列国盟 =====
  { id: 'tiantian', name: '镇天城', type: 'city', x: 380, y: 394, major: true, desc: '列国盟对抗朔漠法士的第一线，修士云集，战事不断。' },
  { id: 'huayi', name: '归意门', type: 'sect', x: 452, y: 406, desc: '列国盟盟主宗门，大长老精通毒道。' },
  // ===== 极西之地 =====
  { id: 'qianzhu', name: '万竹教', type: 'sect', x: 62, y: 476, major: true, desc: '天衍神君所创之教，傀儡之术独步人界，《天衍诀》即出于此。' },
  { id: 'jixi_desert', name: '极西荒漠', type: 'danger', x: 58, y: 566, desc: '黄沙漫天的不毛之地，沙中埋有上古修士遗骸。' },
  // ===== 天穹草原 =====
  { id: 'tianlan', name: '天穹圣殿', type: 'sect', x: 430, y: 300, major: true, desc: '朔漠法士的圣地，供奉天穹圣兽。' },
  { id: 'tuwu', name: '赤勒部落', type: 'town', x: 300, y: 300, desc: '草原游牧部族，与朔漠人世代争斗。' },
  { id: 'mulan', name: '朔漠部落', type: 'town', x: 560, y: 312, desc: '朔漠人的大部落，法士之乡。朔漠与南荒时战时和，再往北便是赤勒人的天穹草原。' },
  { id: 'caoyuan', name: '草原深处', type: 'danger', x: 370, y: 336, desc: '草原深处妖狼成群，风沙之中暗藏杀机。' },
  // ===== 中州 =====
  { id: 'jinjing', name: '玄京', type: 'city', x: 440, y: 152, major: true, desc: '中州京城，人界第一大城，各大世家与宗门的势力交汇于此。' },
  { id: 'tianmo', name: '天魔宗', type: 'sect', x: 240, y: 122, major: true, desc: '中州十大魔宗之首，有化神期老怪坐镇。' },
  { id: 'taiyi', name: '太一门', type: 'sect', x: 520, y: 96, desc: '中州正道大派。' },
  { id: 'yejia', name: '叶家', type: 'town', x: 330, y: 204, desc: '中州顶级修仙世家之一，家族中有元婴修士坐镇。' },
  { id: 'yinyang', name: '阴阳窟', type: 'danger', x: 604, y: 192, desc: '中州有名的凶地，阴阳二气交汇，常有异宝出世。' },
  { id: 'kunwu', name: '封魔山', type: 'secret', x: 718, y: 136, major: true, desc: '上古镇压魔物的古山，昆吾殿所在，人界顶级秘境。' },
  { id: 'beihan', name: '北寒雪原', type: 'danger', x: 300, y: 70, desc: '终年冰封的雪原，冰属妖兽横行。' },
  { id: 'xi_mo', name: '中州西漠', type: 'danger', x: 130, y: 182, desc: '风沙蔽日的大漠。' },
  { id: 'shuozhou', name: '朔州城', type: 'city', x: 374, y: 246, major: true, desc: '中州南疆的州城，舜江自天穹草原流入中州境内。' },
  { id: 'youzhou', name: '幽州城', type: 'city', x: 318, y: 118, desc: '中州北方重镇，北望雪岭，城中多猎妖修士与收购冰属材料的商号。' },
  { id: 'yunzhou', name: '云州城', type: 'city', x: 566, y: 150, desc: '中州东部大城，坊市繁华，常有世家子弟在此斗宝。' },
  { id: 'qinzhou', name: '秦州城', type: 'city', x: 236, y: 196, desc: '中州西陲州城，再往西便是风沙蔽日的西漠。' },
  { id: 'xiangzhou', name: '襄州城', type: 'city', x: 610, y: 236, desc: '中州南部商埠，与草原诸部互市。' },
  { id: 'jin_fangshi', name: '落霞坊市', type: 'town', x: 486, y: 214, desc: '中州散修聚集的坊市，丹药、法器、消息应有尽有，鱼龙混杂。' },
  { id: 'caojia', name: '曹家', type: 'town', x: 394, y: 238, desc: '朔州城外的凡人家族，世代经商，家中小姐曹惜容心地良善。' },
  // ===== 无边海 =====
  { id: 'xutian', name: '归墟殿', type: 'secret', x: 636, y: 352, major: true, island: 9, desc: '冰魄仙子所留的上古殿宇，每隔一段时间现世一次。内藏归墟鼎与补天丹，元婴老怪亦为之疯狂。' },
  // ===== 四周无边海孤礁秘境 =====
  { id: 'tn_haifeng_jiao', name: '海风礁', type: 'isle', x: 618, y: 558, island: 7, danger: 1, desc: '梁国东海岸外的近海礁屿，常有渔舟与炼气期海猎散修在此歇脚。' },
  { id: 'tn_shanhu_yu', name: '赤珊瑚屿', type: 'isle', x: 350, y: 745, island: 8, danger: 2, desc: '南荒南海外的珊瑚群屿，海水清澈，盛产灵贝与低阶海兽妖丹。' },
  { id: 'tn_jixi_yan', name: '极西荒礁', type: 'danger', x: -170, y: 495, island: 8, danger: 3, desc: '极西之地西侧海域的孤峭岩礁，狂浪拍岸，海雾终年不散。' },
  { id: 'tn_chenzhou_jiao', name: '沉舟遗礁', type: 'secret', x: 1090, y: 630, island: 9, danger: 4, desc: '无边海深处的古怪暗礁，礁石间卡着几截不知何年代的巨型灵舟残骸，疑似元婴修士跨海失事之地。' },
  { id: 'tn_guiwu_dao', name: '鬼雾孤岛', type: 'danger', x: 910, y: 920, island: 10, danger: 4, desc: '南溟无边海深处笼罩在青白海雾中的荒岛，高阶海兽在雾气边缘游弋。' },
  { id: 'tn_fengyan_jiao', name: '暴风海眼', type: 'danger', x: 1220, y: 760, major: true, island: 9, danger: 5, desc: '无边海深处的灵气漩涡与雷暴海眼，狂风卷起百丈巨浪，八九级海兽出没，筑基结丹误入有死无生。' },
  { id: 'tn_guixu_qianshao', name: '无边古碑礁', type: 'secret', x: 1340, y: 980, island: 8, danger: 5, desc: '极远无边海深处的一座孤礁，崖顶矗立半截残破界碑，似是上古修士尝试肉身横渡无边海留下的路标。' },
  // ===== 沧溟海 =====
  { id: 'tianxing', name: '观星城', type: 'city', x: 815, y: 500, major: true, island: 28, scale: 1.3, desc: '沧溟海第一大城，建于圣山之上，星罗殿总坛所在，星罗双圣坐镇。' },
  { id: 'chuansong_lx', name: '摇光岛·上古传送阵', type: 'secret', x: 727, y: 476, major: true, desc: '摇光岛外荒礁上的上古传送阵，与南荒梁国的古阵遥相呼应。同样以大挪移令与灵石开启，可回南荒。' },
  { id: 'kuixing', name: '摇光岛', type: 'isle', x: 734, y: 468, major: true, island: 13, desc: '内沧溟外海交界的大岛，魁星城商贾云集，猎妖修士在此出海。' },
  { id: 'jiyin', name: '玄阴岛', type: 'isle', x: 776, y: 604, major: true, island: 12, desc: '玄阴祖师的老巢，沧溟海魔道重地。' },
  { id: 'miaoyin', name: '清音门', type: 'isle', x: 872, y: 560, major: true, island: 10, desc: '沧溟海门派，以音律与媚术闻名，紫萝仙子出身于此。' },
  { id: 'biling', name: '翠波岛', type: 'isle', x: 882, y: 440, island: 9, desc: '盛产灵矿的岛屿。' },
  { id: 'leikong', name: '雷空岛', type: 'isle', x: 760, y: 404, island: 9, desc: '雷云常年不散的岛屿，可采集高阶灵石。' },
  { id: 'xiaohuan', name: '小螺岛', type: 'isle', x: 704, y: 546, island: 8, desc: '偏僻小岛，散修聚居。' },
  { id: 'huangming', name: '曜明岛', type: 'isle', x: 906, y: 506, island: 8, desc: '沧溟内海边缘的岛屿。' },
  { id: 'qiyuan', name: '幽渊岛', type: 'isle', x: 936, y: 630, major: true, island: 10, desc: '沧溟外海猎妖修士的据点，再往外便是妖兽的天下。' },
  { id: 'wuzhong', name: '雾中岛', type: 'isle', x: 958, y: 560, island: 7, desc: '终年被浓雾笼罩的小岛。' },
  { id: 'haiyuan', name: '海猿岛', type: 'isle', x: 700, y: 624, island: 7, desc: '海猿出没的荒岛，人迹罕至。' },
  { id: 'waihai', name: '外海妖域', type: 'danger', x: 962, y: 396, island: 8, desc: '沧溟外海深处，高阶妖兽盘踞，风暴不息。' },
  // ===== 灵界（spirit）大图 · 三大远隔区域（3600×2400 原生坐标，参照《凡人修仙传》风元大陆/天渊城/蛮荒/雷鸣大陆格局） =====
  // 东境 · 风元大陆 / 天渊圣域
  { id: 'tianyuan_cheng', map: 'lingjie', name: '天渊城', type: 'city', x: 2670, y: 1680, major: true, desc: '风元大陆人妖两族共守天渊圣域的雄城，天渊卫与青冥卫分驻城防，坊市、天渊拍卖与化灵池皆设于此。' },
  { id: 'yaohuang_cheng', map: 'lingjie', name: '妖皇圣城', type: 'city', x: 3150, y: 1950, major: true, desc: '人妖两族妖族圣城，天鹏一族与万妖大能云集，千药万材由此流往天渊。' },
  { id: 'tianyuan_feishengtai', map: 'lingjie', name: '接引古台', type: 'secret', x: 2340, y: 1410, major: true, desc: '太古遗留的跨界飞升台，人界化神圆满修士破空飞升后由此受接引降临灵界，须入天渊卫历练方得脱籍。' },
  { id: 'ling_xutian_ta', map: 'lingjie', name: '天渊剑台', type: 'secret', x: 2940, y: 1260, desc: '太初圣宫外悬浮的试剑古台，炼虚合体剑修常在此参悟法则剑意。' },
  { id: 'ling_moyuan_liekou', map: 'lingjie', name: '魔渊防线', type: 'danger', x: 1590, y: 1680, major: true, danger: 4, desc: '分隔蛮荒异族与天渊圣域的万里魔渊防线，两族炼虚执事率天渊卫常年驻防，魔渊斥候频频叩关。' },
  { id: 'tianyuan_chuansong', map: 'lingjie', name: '天渊跨界阵', type: 'secret', x: 2550, y: 1530, desc: '连通天渊圣域、蛮荒古境与无尽雷海的远古远程传送大阵。' },
  { id: 'ling_tianding_yuan', map: 'lingjie', name: '天鼎原', type: 'secret', x: 2320, y: 1860, desc: '天渊南境的太古平川，遗留巨鼎残纹，传闻曾为上古仙修祭炼重宝之坪。' },
  { id: 'ling_zhenling_zhong', map: 'lingjie', name: '真灵古冢', type: 'secret', x: 3300, y: 1680, danger: 5, desc: '万妖圣境极东的古真灵埋骨之地，偶现太古真灵精血与灵泉秘窟。' },
  { id: 'ling_minghe_gu', map: 'lingjie', name: '冥河裂谷', type: 'danger', x: 1840, y: 1980, danger: 6, desc: '万里魔渊南端撕裂大地的阴冥深谷，鬼煞与虚空裂隙交错纵横，合体以下慎入。' },
  // 西境 · 蛮荒古境（异族腹地，与天渊圣域隔千里魔渊荒原）
  { id: 'manhuang_jishi', map: 'lingjie', name: '百族互市', type: 'city', x: 645, y: 1770, major: true, desc: '蛮荒角蚩、灵木、海王诸族与人妖行商易物的边荒巨市，盛产奇毒异木与玄天残材。' },
  { id: 'manhuang_dujie', map: 'lingjie', name: '古魔祭坛', type: 'secret', x: 315, y: 1290, major: true, danger: 5, desc: '灵气与魔煞交汇的太古祭坛，灵界炼虚、合体大能多择此地引动三九、六九或九九天劫。' },
  { id: 'manhuang_lingyuan', map: 'lingjie', name: '万木毒瘴', type: 'danger', x: 930, y: 1440, major: true, danger: 4, desc: '灵木圣林外围的深山瘴林，古猿与毒藤遍野，可采养魂神木与替劫木偶之材。' },
  { id: 'manhuang_chuansong', map: 'lingjie', name: '荒境古阵', type: 'secret', x: 945, y: 1770, desc: '蛮荒古境东端的上古传送阵，可跨越千里魔渊直抵天渊圣域。' },
  { id: 'ling_xuemai_zhao', map: 'lingjie', name: '九幽血沼', type: 'danger', x: 420, y: 1980, danger: 5, desc: '蛮荒南疆的血雾毒泽，蛰伏太古凶兽残裔与万年血灵芝。' },
  // 北境 · 雷鸣大陆外海（无尽雷海与广寒碎域）
  { id: 'leihai_gang', map: 'lingjie', name: '雷鸣仙港', type: 'city', x: 2040, y: 615, major: true, desc: '建在万年避雷礁半岛上的巨城，雷鸣各族与人妖散修交换雷海精金、太阴寒髓的中枢。' },
  { id: 'leihai_leiyan', map: 'lingjie', name: '九霄雷眼', type: 'danger', x: 1290, y: 720, major: true, island: 20, danger: 6, desc: '无尽雷海深处的天雷岛眼，天雷劫云终年不散，乃玄天之宝淬火绝地。' },
  { id: 'ling_canglan_dao', map: 'lingjie', name: '沧澜雷岛', type: 'isle', x: 2840, y: 760, island: 18, danger: 4, desc: '无尽雷海东域的巨大浮礁仙岛，雷蛟与雷修常在此采集天雷晶矿。' },
  { id: 'leihai_bingyu', map: 'lingjie', name: '广寒冰狱', type: 'danger', x: 1530, y: 270, major: true, danger: 6, desc: '极北广寒碎域冻结万古的太阴冰狱，孕育太阴寒髓与高阶玄冰异兽。' },
  { id: 'ling_suixing_bingyuan', map: 'lingjie', name: '碎星冰原', type: 'danger', x: 960, y: 260, danger: 5, desc: '西北广寒边缘的碎星极地，常年冰暴怒吼，散落星陨寒铁。' },
  { id: 'leihai_feixiantai', map: 'lingjie', name: '飞仙台', type: 'secret', x: 2820, y: 270, major: true, desc: '大乘巅峰引动大乘飞升劫、接引真仙灵光飞升仙界的圣台。' },
  { id: 'leihai_chuansong', map: 'lingjie', name: '雷海传阵', type: 'secret', x: 2190, y: 690, desc: '连通无尽雷海与天渊圣域的远古阵坛。' },

  // ===== 仙界（immortal）大图 · 三大远隔仙域（2400×1600 原生坐标） =====
  // 西北 · 北寒仙域
  { id: 'beihan_xiancheng', map: 'xianjie', name: '北寒仙城', type: 'city', x: 440, y: 430, major: true, desc: '灵界修士飞升北寒仙域后最先落脚的雄城，仙元石与低阶仙丹流通最盛。' },
  { id: 'beihan_xilianchi', map: 'xianjie', name: '化仙古池', type: 'secret', x: 240, y: 220, major: true, desc: '仙域接引化仙之池，新晋真仙在此洗去凡尘灵元，凝炼仙体本源。' },
  { id: 'beihan_bingkuang', map: 'xianjie', name: '玄霜仙矿', type: 'danger', x: 680, y: 240, major: true, danger: 6, desc: '北寒仙域蕴藏下品仙晶的极寒仙矿，玄霜仙兽守矿而出。' },
  { id: 'beihan_chuansong', map: 'xianjie', name: '北寒仙阵', type: 'secret', x: 540, y: 590, desc: '连通北寒仙域与金源仙域的远程传送仙阵。' },
  // 中南 · 金源仙域（与北寒隔万里冰障仙脉）
  { id: 'lingxiao_xiancheng', map: 'xianjie', name: '玉皇仙城', type: 'city', x: 1260, y: 960, major: true, desc: '金源仙域至高仙城，玉皇仙宫、斩仙榜与三十六仙窍讲坛皆立于此。' },
  { id: 'jinyuan_fang', map: 'xianjie', name: '太乙剑坊', type: 'city', x: 1020, y: 840, major: true, desc: '太乙剑庭主理的仙界大市，云集仙器、仙方与法则推演师。' },
  { id: 'jinyuan_suiyue_gu', map: 'xianjie', name: '岁月遗迹', type: 'secret', x: 1480, y: 1120, major: true, danger: 6, desc: '大罗时间道场崩碎所化遗迹，散落法则晶丝与《岁月天书》原章。' },
  { id: 'jinyuan_zhanshan_tai', map: 'xianjie', name: '斩三尸圣坛', type: 'secret', x: 1380, y: 620, major: true, desc: '太乙金仙斩断善恶执三尸、叩响大罗道果的无上道台。' },
  { id: 'jinyuan_chuansong', map: 'xianjie', name: '金源仙阵', type: 'secret', x: 1220, y: 1140, desc: '金源仙域通往北寒仙域与灰界渊墟的中枢大阵。' },
  // 极东 · 灰界渊墟（与金源隔蚀道断崖与灰煞裂谷）
  { id: 'huiyuan_jishi', map: 'xianjie', name: '渊墟灰市', type: 'city', x: 1920, y: 900, major: true, desc: '灰界边缘三不管仙市，寻觅混沌净源与灰界仙材的散仙聚集地。' },
  { id: 'huiyuan_shixi', map: 'xianjie', name: '灰煞潮汐带', type: 'danger', x: 2120, y: 660, major: true, danger: 6, desc: '灰煞翻涌、天人五衰加剧的绝境，蚀仙兽与混沌净源并存。' },
  { id: 'huiyuan_tianshu_dian', map: 'xianjie', name: '终劫太初殿', type: 'secret', x: 2180, y: 1320, major: true, desc: '镇压仙界时间源流的古殿，集齐七页《岁月天书》后可在此证道超脱。' },
  { id: 'huiyuan_chuansong', map: 'xianjie', name: '渊墟归阵', type: 'secret', x: 1840, y: 1040, desc: '返归金源仙域的远程仙阵。' },

  // ===== v0.60：十五座新宗门（data/sects.ts） =====
  ...XSECTS.map((s): RawLoc => ({ id: s.id, name: s.name, type: 'sect', x: s.x, y: s.y, desc: s.desc, ...(s.major ? { major: true } : {}), ...(s.island ? { island: s.island } : {}), ...(s.map ? { map: s.map } : {}) })),
];


// ---------- 小地点名字表 ----------
import { mulberry32 } from '../core/rng';
const SURN = ['李', '王', '张', '刘', '陈', '杨', '赵', '黄', '周', '吴', '徐', '孙', '马', '朱', '胡', '林', '郭', '何', '高', '罗', '郑', '梁', '谢', '宋', '唐', '许', '韩', '冯', '邓', '曹', '彭', '曾', '萧', '田', '董', '潘', '袁', '蔡', '蒋', '余', '叶', '程', '苏', '魏', '吕', '丁', '沈', '任', '姚', '卢'];
const VSUF = ['家村', '家庄', '家集', '家坳', '家寨', '家湾', '家堡', '家店'];
const VNAT = ['柳溪村', '杏花村', '桃源村', '石桥镇', '落霞村', '清水镇', '青石村', '白鹭洲', '野狐岭村', '芦花荡', '枫林渡', '风铃镇', '卧牛村', '鹤鸣村', '云水镇', '小河村', '老槐村', '望山村', '月牙村', '沙河集', '梨花坞', '竹溪村', '浣纱溪', '松风镇', '百花村', '落雁集', '蓬溪村', '烟柳镇', '黄泥岗', '双河镇', '古井村', '红叶村', '渔歌渡', '雁回镇', '茶山村', '翠屏村', '飞泉村', '牧野集', '霜叶村', '采莲渡'];
const CAVES = ['古修洞府', '无名洞府', '青云洞', '栖霞洞', '紫霄洞', '残阵遗迹', '上古战场', '坐化之地', '藏宝秘窟', '灵眼之泉', '断剑崖', '炼丹古洞', '落仙台', '玄冰洞', '万灵古窟', '天机遗府', '星落坑', '散仙石室', '剑冢', '药王谷遗址', '古阵废墟', '归元洞', '幽泉秘境', '石林古阵', '千年古墓', '仙人棋盘', '紫竹幽谷', '云梦泽'];
const LAIRS = ['血狼谷', '黑风岭', '毒蛟潭', '铁甲蛇窟', '赤蜂林', '妖狐洞', '鬼哭林', '乱石坡', '阴风涧', '火蟾沼', '白骨岗', '豺狼原', '石魔窟', '瘴气林', '金蜈岭', '黑熊坳', '狐仙坡', '血蝠洞', '腐骨沼', '虎啸涧', '蛇盘山', '野猿林', '毒雾谷', '尸鬼坟'];
const LAIRS_COLD = ['冰狼原', '雪熊谷', '寒蛟渊', '霜鹰崖'];
const LAIRS_DRY = ['沙蝎窟', '毒蜥坡', '黄沙鬼域', '风蚀石林'];
const LAIRS_SEA = ['海妖礁', '鲛人滩', '巨蟹湾', '海蛇窟'];


export function pointInPoly(x: number, y: number, pts: P[]) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function regionAt(mx: number, my: number, onLand: boolean): Region | null {
  for (const r of REGIONS) {
    const sea = r.parent === '沧溟海' || r.parent === '无边海' || r.parent === '北海' || r.id === 'lh_south';
    if (onLand && (r.parent === '无边海' || r.id === 'beihai')) continue;
    if (!onLand && !sea) continue;
    if (pointInPoly(mx, my, r.pts)) return r;
  }
  return null;
}

export const LOC_TYPE_NAME: Record<LocType, string> = {
  city: '城池', town: '集镇', sect: '宗门', danger: '险地', secret: '秘境', isle: '海岛', inn: '驿站',
};


// =====================================================================================
// =====================================================================================
// 第十六步及三界拓展：五张大地图（人界三域 + 灵界大域 + 仙界大域）
// =====================================================================================
export type MapId = AnyMapId;
export const ALL_MAP_IDS: MapId[] = ['renjie', 'lingjie', 'xianjie'];
export const MAP_NAME: Record<MapId, string> = {
  renjie: '人界全境',
  lingjie: '灵界全境',
  xianjie: '仙界全境',
};

/** 每张图：人界大地图沿用旧版统一地图（legacy 坐标）平移 + 等比缩放 2.0x；灵界/仙界大地图使用原生坐标 */
export interface MapSpec { worldId: WorldId; nativeOnly?: boolean; ox: number; oy: number; sx: number; sy: number; W: number; H: number; rangeK: number; riverK: number }
export const TN_OX = -600;
export const TN_SX = 1.6;
export const TN_DX = -TN_OX * TN_SX; // +960 宏观单位（供旧版天南存档兼容）

export const LEGACY_SPEC: Record<LegacyHumanMapId, { ox: number; oy: number; sx: number; sy: number; W: number; H: number }> = {
  tiannan: { ox: TN_OX, oy: 262, sx: TN_SX, sy: 1.6, W: 4800, H: 2600 },
  luanxing: { ox: 600, oy: 280, sx: 2.0, sy: 2.0, W: 800, H: 840 },
  dajin: { ox: 0, oy: 0, sx: 1.46, sy: 2.65, W: 1200, H: 880 },
};

const SPEC: Record<MapId, MapSpec> = {
  // 人界全境：中州、天穹草原、朔漠草原、南荒、极西之地、沧溟海与四周无边海合一（3600×2400，等比 2.0x）
  renjie: { worldId: 'human', ox: -350, oy: -60, sx: 2.0, sy: 2.0, W: 3600, H: 2400, rangeK: 1.5, riverK: 1.4 },
  // 灵界大地图（三大远隔灵域合一，原生坐标）
  lingjie: { worldId: 'spirit', nativeOnly: true, ox: 0, oy: 0, sx: 1, sy: 1, W: 3600, H: 2400, rangeK: 1.5, riverK: 1.25 },
  // 仙界大地图（三大远隔仙域合一，原生坐标）
  xianjie: { worldId: 'immortal', nativeOnly: true, ox: 0, oy: 0, sx: 1, sy: 1, W: 2400, H: 1600, rangeK: 1.5, riverK: 1.2 },
};
export const MAP_SPECS: Record<MapId, MapSpec> = SPEC;
export function toMap(id: MapId, x: number, y: number): P { const s = SPEC[normalizeMapPick(id) ?? 'renjie']; return s.nativeOnly ? [x, y] : [(x - s.ox) * s.sx, (y - s.oy) * s.sy]; }
export function fromMap(id: MapId, x: number, y: number): P { const s = SPEC[normalizeMapPick(id) ?? 'renjie']; return s.nativeOnly ? [x, y] : [x / s.sx + s.ox, y / s.sy + s.oy]; }
/** 将旧版人界三图（tiannan / luanxing / dajin）的宏观坐标转换为新统一图 renjie 的宏观坐标 */
export function migrateHumanPoint(oldMap: LegacyHumanMapId, mx: number, my: number): P {
  const ls = LEGACY_SPEC[oldMap];
  const lx = mx / ls.sx + ls.ox;
  const ly = my / ls.sy + ls.oy;
  const [rx, ry] = toMap('renjie', lx, ly);
  const rs = SPEC.renjie;
  return [Math.min(rs.W - 2, Math.max(2, rx)), Math.min(rs.H - 2, Math.max(2, ry))];
}

function normalizeMapPick(v: unknown): MapId | null {
  if (typeof v !== 'string') return null;
  if ((ALL_MAP_IDS as string[]).includes(v)) return v as MapId;
  if ((LEGACY_HUMAN_MAP_IDS as readonly string[]).includes(v)) return 'renjie';
  return null;
}

function pickMap(): MapId {
  try { const v = normalizeMapPick((globalThis as any).__FANREN_MAP); if (v) return v; } catch { /* */ }
  try { const v = normalizeMapPick((globalThis as any).process?.env?.FANREN_MAP); if (v) return v; } catch { /* */ }
  try { const v = normalizeMapPick(new URLSearchParams(location.search).get('map')); if (v) return v; } catch { /* */ }
  try { const v = normalizeMapPick(localStorage.getItem('fanren.map')); if (v) return v; } catch { /* */ }
  return 'renjie';
}
/** 当前加载的地图（整个程序生命周期内不变；换图 = 存档后重新载入） */
export const ACTIVE_MAP: MapId = pickMap();
/** 当前加载地图所属的世界 ID */
export const ACTIVE_WORLD: WorldId = worldOfMap(ACTIVE_MAP);
/** 当前世界内的地图列表（用于舆图切换页签及本界枚举） */
export const MAP_IDS: MapId[] = [...WORLDS[ACTIVE_WORLD].maps] as MapId[];

/** 旧版统一地图上的一点属于哪张图（人界已合并为 renjie） */
export function legacyMapOf(_x: number, _y: number): MapId {
  return 'renjie';
}
/** 旧版世界坐标（像素）→ 新图与新坐标（像素），用于旧存档迁移、测试 */
export function fromLegacyWorld(wx: number, wy: number): { map: MapId; x: number; y: number } {
  const lx = wx / WORLD_SCALE, ly = wy / WORLD_SCALE, map = legacyMapOf(lx, ly), s = SPEC[map];
  const [mx, my] = toMap(map, lx, ly);
  return { map, x: Math.min(s.W - 2, Math.max(2, mx)) * WORLD_SCALE, y: Math.min(s.H - 2, Math.max(2, my)) * WORLD_SCALE };
}
/** legacy 宏观坐标若在当前图上，返回当前图宏观坐标 */
export function legacyHere(x: number, y: number): P | null { return legacyMapOf(x, y) === ACTIVE_MAP ? toMap(ACTIVE_MAP, x, y) : null; }
/** 当前图宏观坐标 → legacy 宏观坐标（沿用旧版按经纬划分的规则，如喀斯特山形、北方强敌） */
export function toLegacy(mx: number, my: number): P { return fromMap(ACTIVE_MAP, mx, my); }

// ---------- 几何工具 ----------
/** Sutherland–Hodgman：多边形裁剪到矩形 */
function clipPoly(pts: P[], x0: number, y0: number, x1: number, y1: number): P[] {
  const edges: [(p: P) => boolean, (a: P, b: P) => P][] = [
    [(p) => p[0] >= x0, (a, b) => [x0, a[1] + ((b[1] - a[1]) * (x0 - a[0])) / (b[0] - a[0])]],
    [(p) => p[0] <= x1, (a, b) => [x1, a[1] + ((b[1] - a[1]) * (x1 - a[0])) / (b[0] - a[0])]],
    [(p) => p[1] >= y0, (a, b) => [a[0] + ((b[0] - a[0]) * (y0 - a[1])) / (b[1] - a[1]), y0]],
    [(p) => p[1] <= y1, (a, b) => [a[0] + ((b[0] - a[0]) * (y1 - a[1])) / (b[1] - a[1]), y1]],
  ];
  let out = pts;
  for (const [inside, cut] of edges) {
    const inp = out; out = [];
    for (let i = 0; i < inp.length; i++) {
      const a = inp[(i + inp.length - 1) % inp.length], b = inp[i];
      if (inside(b)) { if (!inside(a)) out.push(cut(a, b)); out.push(b); } else if (inside(a)) out.push(cut(a, b));
    }
    if (!out.length) break;
  }
  return out;
}
function bboxHits(pts: P[], x0: number, y0: number, x1: number, y1: number) {
  let a = 1e9, b = 1e9, c = -1e9, d = -1e9;
  for (const [x, y] of pts) { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y); }
  return c >= x0 && a <= x1 && d >= y0 && b <= y1;
}

// ---------- 各图独有的补充数据（legacy 坐标） ----------
const EXTRA_RIVERS: Partial<Record<MapId, { pts: P[]; w: number }[]>> = {
  // 舜江：自天穹草原北流入中州朔州（原著苏寒冰封漂流之江）
  renjie: [{ pts: [[452, 330], [430, 312], [404, 292], [384, 274], [370, 258], [352, 236], [330, 214], [318, 200]], w: 1.3 }],
};
// 大区域标签（人界用 legacy 坐标；灵仙界由 NATIVE_GEO 直接给出原生坐标）
const MAP_LABELS: Partial<Record<MapId, { name: string; at: P; size: number }[]>> = {
  renjie: [
    { name: '中州', at: [430, 146], size: 7.5 },
    { name: '北寒雪原', at: [300, 62], size: 3.4 },
    { name: '天穹草原', at: [390, 286], size: 3.2 },
    { name: '朔漠草原', at: [460, 342], size: 3.2 },
    { name: '南荒', at: [330, 520], size: 6.5 },
    { name: '极西之地', at: [62, 470], size: 3.0 },
    { name: '沧溟海', at: [830, 420], size: 6.0 },
    { name: '沧溟内海', at: [815, 535], size: 3.0 },
    { name: '沧溟外海', at: [950, 660], size: 3.0 },
    { name: '无边海', at: [614, 520], size: 2.8 },
    { name: '无边深海', at: [1220, 620], size: 6.5 },
    { name: '南溟海', at: [480, 920], size: 7.0 },
    { name: '极西外海', at: [-180, 520], size: 5.5 },
  ],
};
const MAP_REGIONS: Partial<Record<MapId, string[]>> = {
  renjie: ['yue', 'yuanwu', 'cheqi', 'zijin', 'tiandao', 'zhuimo', 'modao', 'jiuguo', 'jixi', 'tianlan', 'mulan', 'dajin', 'luanxing_inner', 'luanxing_outer', 'wubian', 'beihai'],
};
// 随机小岛：沧溟海星罗棋布；人界四周无边海按近海/中海递减撒落小岛与孤礁，极远深海辽阔苍茫
const ISLES: Record<MapId, { field?: { x0: number; y0: number; x1: number; y1: number; count: number }; extra: { x0: number; y0: number; x1: number; y1: number; n: number; r0: number; r1: number }[]; rk: number }> = {
  renjie: {
    field: { x0: 2010, y0: 704, x1: 2710, y1: 1520, count: 440 },
    extra: [
      // 北海沿岸岛屿
      { x0: 760, y0: 14, x1: 2680, y1: 155, n: 24, r0: 1.8, r1: 4.5 },
      // 南荒南溟近海群岛与梁国东岸近海岛屿
      { x0: 740, y0: 1475, x1: 2150, y1: 1740, n: 28, r0: 1.5, r1: 4.5 },
      { x0: 1860, y0: 660, x1: 2005, y1: 1480, n: 18, r0: 1.3, r1: 3.4 },
      // 极西近海群岛
      { x0: 420, y0: 240, x1: 690, y1: 1460, n: 20, r0: 1.4, r1: 4.0 },
      // 东/东南中无边海稀疏孤礁（逐步过渡到空旷深海）
      { x0: 2730, y0: 260, x1: 3250, y1: 1750, n: 26, r0: 1.7, r1: 4.8 },
      // 极远深海：极少数风暴礁石（保持大片茫茫大海）
      { x0: 200, y0: 1760, x1: 3450, y1: 2320, n: 14, r0: 1.6, r1: 3.8 },
      { x0: 3260, y0: 160, x1: 3540, y1: 2320, n: 10, r0: 1.6, r1: 3.6 },
    ],
    rk: 1.45,
  },
  lingjie: {
    field: { x0: 620, y0: 440, x1: 3440, y1: 1120, count: 320 },
    extra: [
      { x0: 2380, y0: 460, x1: 3480, y1: 1080, n: 36, r0: 1.8, r1: 5.0 },
      { x0: 640, y0: 450, x1: 1820, y1: 1080, n: 34, r0: 1.7, r1: 4.8 },
      { x0: 80, y0: 2240, x1: 3500, y1: 2360, n: 20, r0: 1.4, r1: 3.8 },
    ],
    rk: 1.45,
  },
  xianjie: {
    extra: [
      { x0: 960, y0: 60, x1: 1680, y1: 370, n: 18, r0: 1.5, r1: 3.6 },
      { x0: 80, y0: 830, x1: 740, y1: 1480, n: 16, r0: 1.5, r1: 3.8 },
    ],
    rk: 1.1,
  },
};

interface NativeGeo {
  mainland: P[];
  lakes: typeof RAW_LAKES;
  ranges: typeof RAW_RANGES;
  rivers: typeof RAW_RIVERS;
  arid: typeof RAW_ARID;
  cold: typeof RAW_COLD;
  forest: typeof RAW_FOREST;
  regions: Region[];
  labels: { name: string; at: P; size: number }[];
}
const NATIVE_GEO: Partial<Record<MapId, NativeGeo>> = {
  lingjie: {
    mainland: [
      // 北境 · 广寒碎域冰原与海岸峡湾
      [190, 150], [360, 118], [580, 134], [830, 108], [1080, 126], [1340, 104], [1620, 122], [1910, 108],
      [2200, 132], [2500, 112], [2820, 124], [3120, 142], [3320, 210], [3260, 345], [3010, 410],
      // 雷鸣仙港半岛伸入无尽雷海，分隔东西雷海域
      [2720, 435], [2440, 455], [2310, 565], [2320, 745], [2160, 810], [1930, 785], [1810, 675],
      [1820, 510], [1650, 455], [1340, 430], [1040, 450], [740, 445], [610, 535],
      // 西北荒寒走廊接蛮荒古境
      [580, 720], [640, 910], [790, 1045], [1060, 1110], [1380, 1150], [1680, 1110], [1990, 1135],
      [2240, 1090], [2540, 1050], [2860, 1095], [3190, 1065], [3440, 1120],
      // 东境天渊海岸与南疆折岸
      [3490, 1340], [3430, 1580], [3485, 1840], [3410, 2090], [3260, 2245], [2950, 2265],
      [2620, 2210], [2290, 2255], [1960, 2205], [1640, 2265], [1310, 2225], [960, 2270],
      [620, 2250], [320, 2220], [160, 2060], [135, 1780], [170, 1510], [130, 1240],
      [180, 960], [150, 660], [165, 380],
    ],
    lakes: [
      { c: [2640, 1815], r: 34, name: '天渊灵湖' },
      { c: [2980, 1570], r: 22, name: '太初仙泊' },
      { c: [2360, 2040], r: 24, name: '青冥幽泽' },
      { c: [3190, 1830], r: 19 },
      { c: [690, 1560], r: 30, name: '蛮荒血沼' },
      { c: [790, 2050], r: 22, name: '灵木灵潭' },
      { c: [1980, 255], r: 28, name: '太阴冰湖' },
      { c: [1280, 260], r: 20, name: '玄霜寒潭' },
    ],
    ranges: [
      // 西境蛮荒群山（蜿蜒起伏）
      { pts: [[240, 1180], [380, 1290], [520, 1410], [700, 1360], [860, 1260]], w: 34, h: 1.0, name: '古魔山脉' },
      { pts: [[260, 1710], [430, 1820], [580, 1740], [720, 1660]], w: 28, h: 0.9, name: '血牙魔岭' },
      { pts: [[860, 1280], [1020, 1460], [1110, 1690], [1020, 1960], [940, 2140]], w: 32, h: 0.95, name: '神木断岭' },
      // 中部万里魔渊荒岭（双脉蜿蜒挟持魔渊裂谷，天然隔断蛮荒与天渊）
      { pts: [[1320, 1210], [1460, 1420], [1540, 1660], [1670, 1910], [1810, 2140]], w: 42, h: 1.08, name: '万里魔渊岭' },
      { pts: [[1820, 1220], [1980, 1400], [2080, 1650], [2010, 1920], [2120, 2130]], w: 36, h: 1.0, name: '天渊西障' },
      // 东境天渊群山
      { pts: [[2680, 1210], [2840, 1310], [3060, 1360], [3280, 1520]], w: 30, h: 0.96, name: '太初剑脉' },
      { pts: [[2840, 1740], [3040, 1860], [3260, 1890], [3380, 1720]], w: 28, h: 0.92, name: '万妖圣岳' },
      { pts: [[2240, 1980], [2440, 2090], [2690, 2120]], w: 26, h: 0.88, name: '青冥阴岭' },
      // 北境广寒冰脊 & 西北荒寒连山
      { pts: [[230, 1020], [310, 780], [370, 530], [490, 310]], w: 34, h: 0.98, name: '荒寒连山' },
      { pts: [[760, 205], [1140, 180], [1540, 215], [1920, 175], [2340, 210]], w: 30, h: 1.0, name: '广寒冰脊' },
      { pts: [[2420, 215], [2710, 240], [2980, 200], [3190, 270]], w: 26, h: 0.92, name: '碎星寒岭' },
    ],
    rivers: [
      { pts: [[2360, 1320], [2510, 1510], [2640, 1815], [2890, 2020], [3190, 2160], [3370, 2210]], w: 3.4 },
      { pts: [[3060, 1380], [3010, 1570], [3160, 1760], [3360, 1960]], w: 2.4 },
      { pts: [[2360, 2040], [2540, 2150], [2760, 2230]], w: 2.2 },
      { pts: [[420, 1380], [580, 1520], [690, 1560], [760, 1840], [920, 2140]], w: 2.8 },
      { pts: [[1980, 255], [2020, 440], [2060, 620], [2080, 770]], w: 2.2 },
      { pts: [[1280, 260], [1310, 360], [1340, 440]], w: 1.8 },
    ],
    arid: [
      { pts: [[170, 1120], [920, 1080], [1480, 1150], [2160, 1140], [2120, 2210], [1220, 2230], [170, 2180]], v: 0.85 },
    ],
    cold: [
      { pts: [[130, 80], [3360, 90], [3340, 430], [2440, 460], [1810, 470], [640, 490], [130, 460]], v: 1.0 },
    ],
    forest: [
      { pts: [[760, 1340], [1220, 1310], [1260, 2200], [680, 2210]], v: 0.9 },
      { pts: [[2240, 1140], [3420, 1120], [3440, 2210], [2210, 2210]], v: 0.84 },
    ],
    regions: [
      { id: 'mh_north', name: '角蚩王境', parent: '蛮荒古境', pts: [[120, 1060], [1280, 1060], [1280, 1700], [120, 1700]], label: [510, 1380], labelSize: 1.9 },
      { id: 'mh_east', name: '万木圣林', parent: '蛮荒古境', pts: [[760, 1700], [1280, 1700], [1280, 2320], [760, 2320]], label: [1010, 2020], labelSize: 1.8 },
      { id: 'mh_south', name: '百族荒原', parent: '蛮荒古境', pts: [[120, 1700], [760, 1700], [760, 2320], [120, 2320]], label: [435, 2000], labelSize: 1.9 },
      { id: 'tianyuan_west', name: '魔渊裂隙带', parent: '万里魔渊', pts: [[1280, 1060], [2190, 1060], [2190, 2320], [1280, 2320]], label: [1735, 1680], labelSize: 2.0 },
      { id: 'tianyuan_east', name: '太初剑境', parent: '天渊圣域', pts: [[2190, 1040], [3540, 1040], [3540, 1680], [2190, 1680]], label: [2880, 1380], labelSize: 2.0 },
      { id: 'tianyuan_south', name: '万妖圣境', parent: '天渊圣域', pts: [[2190, 1680], [3540, 1680], [3540, 2320], [2190, 2320]], label: [2940, 2010], labelSize: 2.0 },
      { id: 'lh_west_corridor', name: '荒寒走廊', parent: '广寒碎域', pts: [[100, 440], [640, 440], [640, 1060], [100, 1060]], label: [360, 740], labelSize: 1.6 },
      { id: 'lh_north', name: '广寒碎域', parent: '广寒碎域', pts: [[100, 60], [3440, 60], [3440, 440], [100, 440]], label: [1920, 225], labelSize: 2.1 },
      { id: 'lh_south', name: '无尽雷海', parent: '无尽雷海', pts: [[640, 440], [3540, 440], [3540, 1060], [640, 1060]], label: [1440, 735], labelSize: 2.1 },
    ],
    labels: [
      { name: '蛮荒古境', at: [640, 1640], size: 7.4 },
      { name: '万里魔渊', at: [1720, 1660], size: 5.8 },
      { name: '天渊圣域', at: [2820, 1600], size: 7.6 },
      { name: '无尽雷海', at: [1480, 780], size: 6.8 },
      { name: '广寒碎域', at: [2080, 210], size: 5.4 },
    ],
  },
  xianjie: {
    mainland: [
      [90, 90], [920, 90], [1020, 420], [1640, 400], [1740, 260], [2320, 280],
      [2330, 1480], [1720, 1500], [1580, 1420], [860, 1460], [780, 820], [90, 780],
    ],
    lakes: [
      { c: [240, 220], r: 20, name: '化仙古池' },
      { c: [640, 560], r: 16, name: '寒晶仙湖' },
      { c: [1260, 960], r: 24, name: '太液仙池' },
      { c: [1040, 1080], r: 16, name: '轮回镜湖' },
      { c: [2120, 1020], r: 20, name: '灰煞渊湖' },
    ],
    ranges: [
      // 北寒仙脉与冰障（隔断北寒与金源）
      { pts: [[180, 130], [460, 120], [780, 160]], w: 26, h: 1.0, name: '北寒冰障' },
      { pts: [[680, 380], [840, 540], [920, 720]], w: 34, h: 1.05, name: '玄霜仙脉' },
      // 金源仙岳
      { pts: [[1020, 560], [1260, 540], [1540, 620]], w: 26, h: 1.0, name: '金源仙岳' },
      { pts: [[980, 940], [1140, 1000], [1200, 1320]], w: 22, h: 0.9, name: '太乙剑岭' },
      // 蚀道断崖（隔断金源与灰界渊墟）
      { pts: [[1620, 460], [1700, 780], [1740, 1140], [1680, 1400]], w: 36, h: 1.1, name: '蚀道断崖' },
      { pts: [[1960, 480], [2180, 600], [2240, 880]], w: 26, h: 1.0, name: '终劫绝岭' },
    ],
    rivers: [
      { pts: [[240, 220], [420, 380], [560, 490], [640, 560]], w: 2.2 },
      { pts: [[1380, 620], [1280, 820], [1260, 960], [1400, 1180], [1540, 1340]], w: 3.0 },
      { pts: [[1940, 640], [2040, 860], [2120, 1020]], w: 2.0 },
    ],
    arid: [
      { pts: [[1700, 280], [2330, 280], [2330, 1490], [1700, 1490]], v: 0.95 },
    ],
    cold: [
      { pts: [[70, 70], [960, 70], [960, 760], [70, 760]], v: 0.95 },
    ],
    forest: [
      { pts: [[920, 540], [1640, 540], [1640, 1400], [920, 1400]], v: 0.72 },
    ],
    regions: [
      { id: 'bh_west', name: '广寒仙境', parent: '北寒仙域', pts: [[60, 60], [500, 60], [500, 800], [60, 800]], label: [290, 380], labelSize: 1.8 },
      { id: 'bh_east', name: '玄霜仙矿区', parent: '北寒仙域', pts: [[500, 60], [920, 60], [920, 800], [500, 800]], label: [700, 380], labelSize: 1.8 },
      { id: 'jy_west', name: '剑庭轮回境', parent: '金源仙域', pts: [[840, 440], [1160, 440], [1160, 1500], [840, 1500]], label: [1010, 1020], labelSize: 1.8 },
      { id: 'jy_core', name: '玉皇仙都', parent: '金源仙域', pts: [[1160, 440], [1420, 440], [1420, 1500], [1160, 1500]], label: [1290, 880], labelSize: 1.9 },
      { id: 'jy_east', name: '岁月古域', parent: '金源仙域', pts: [[1420, 440], [1720, 440], [1720, 1500], [1420, 1500]], label: [1540, 1080], labelSize: 1.8 },
      { id: 'hy_west', name: '渊墟外缘', parent: '灰界渊墟', pts: [[1720, 240], [2020, 240], [2020, 1520], [1720, 1520]], label: [1880, 860], labelSize: 1.8 },
      { id: 'hy_east', name: '蚀道深渊', parent: '灰界渊墟', pts: [[2020, 240], [2360, 240], [2360, 1520], [2020, 1520]], label: [2190, 920], labelSize: 1.9 },
    ],
    labels: [
      { name: '北寒仙域', at: [460, 340], size: 7.0 },
      { name: '金源仙域', at: [1280, 880], size: 7.6 },
      { name: '灰界渊墟', at: [2040, 880], size: 7.2 },
    ],
  },
};

export interface MapExit { edge: 'n' | 's' | 'e' | 'w'; to: MapId; days: number; title: string; text: string }
/** 走到地图边缘可前往的相邻地图（陆路） */
export const MAP_EXITS: Record<MapId, MapExit[]> = {
  renjie: [],
  lingjie: [],
  xianjie: [],
};
export const EDGE_BLOCK_TEXT: Record<MapId, string> = {
  renjie: '前方已是人界天涯尽头——无尽无边海与北寒冰渊风暴肆虐，纵使化神修士也不可再深入。',
  lingjie: '前方乃灵界界壁风暴带，非大乘以上空间神通不可硬闯。',
  xianjie: '前方乃终极虚无混沌海，纵使大罗亦不可轻入。',
};
/** 传送阵：两端地点 id */
export const PORTALS: { a: string; b: string; minRealm: number; cost: number; token: string }[] = [
  { a: 'chuansong', b: 'chuansong_lx', minRealm: 2, cost: 600, token: 'tok_danuoyi' },
  { a: 'tianyuan_chuansong', b: 'manhuang_chuansong', minRealm: 5, cost: 15, token: '' },
  { a: 'tianyuan_chuansong', b: 'leihai_chuansong', minRealm: 5, cost: 20, token: '' },
  { a: 'beihan_chuansong', b: 'jinyuan_chuansong', minRealm: 9, cost: 8, token: '' },
  { a: 'jinyuan_chuansong', b: 'huiyuan_chuansong', minRealm: 9, cost: 12, token: '' },
];

// ---------- 程序生成的小地点 ----------
interface MapData {
  id: MapId; W: number; H: number;
  mainland: P[]; lakes: typeof RAW_LAKES; ranges: typeof RAW_RANGES; rivers: typeof RAW_RIVERS;
  arid: typeof RAW_ARID; cold: typeof RAW_COLD; forest: typeof RAW_FOREST;
  regions: Region[]; labels: { name: string; at: P; size: number }[]; locations: LocDef[];
  islandField: { x0: number; y0: number; x1: number; y1: number; count: number } | null;
  extraIslands: { x0: number; y0: number; x1: number; y1: number; n: number; r0: number; r1: number }[];
  islandK: number;
}

function genMinor(M: MapData, seed: number, pre: string): LocDef[] {
  const rnd = mulberry32(seed);
  const out: LocDef[] = [];
  const all = () => M.locations.concat(out);
  const far = (x: number, y: number, d: number) => all().every((l) => Math.hypot(l.x - x, l.y - y) > d);
  const inLake = (x: number, y: number) => M.lakes.some((l) => Math.hypot(l.c[0] - x, l.c[1] - y) < l.r + 3);
  const cold = (x: number, y: number) => M.cold.some((z) => pointInPoly(x, y, z.pts));
  const dry = (x: number, y: number) => M.arid.some((z) => pointInPoly(x, y, z.pts) && z.v > 0.8);
  const onLand = (x: number, y: number) => M.mainland.length > 2 && pointInPoly(x, y, M.mainland);
  const used = new Set<string>(M.locations.map((l) => l.name));
  const DIRS = ['东', '西', '南', '北', '上', '下', '前', '后', '新', '老', '大', '小'];
  const uname = (base: string) => {
    const stem = base.replace(/(村|庄|集|坳|寨|湾|堡|店|镇|洲|荡|渡|岛|屿)$/, ''), suf = stem === base ? '' : base.slice(-1);
    let n = base, k = 0;
    while (used.has(n)) { n = k < DIRS.length ? stem + DIRS[k] + suf : DIRS[k % DIRS.length] + stem + DIRS[Math.floor(k / DIRS.length) % DIRS.length] + suf; if (++k > 140) { n = base + k; break; } }
    used.add(n); return n;
  };
  const mk = (l: Omit<LocDef, 'map' | 'ox' | 'oy' | 'id'>) => { const [ox, oy] = fromMap(M.id, l.x, l.y); out.push({ ...l, id: pre + (l.type === 'town' ? 'v' : l.type === 'secret' ? 'c' : l.type === 'isle' ? 'i' : 'd') + out.length, map: M.id, ox, oy }); };
  // 陆地面积（按主大陆包围盒采样，避免外扩海量海域后采样命中率过低）
  let bx0 = 0, by0 = 0, bx1 = M.W, by1 = M.H;
  if (M.mainland.length > 2) {
    bx0 = 1e9; by0 = 1e9; bx1 = -1e9; by1 = -1e9;
    for (const [x, y] of M.mainland) { bx0 = Math.min(bx0, x); by0 = Math.min(by0, y); bx1 = Math.max(bx1, x); by1 = Math.max(by1, y); }
    bx0 = Math.max(8, bx0 - 4); by0 = Math.max(8, by0 - 4); bx1 = Math.min(M.W - 8, bx1 + 4); by1 = Math.min(M.H - 8, by1 + 4);
  }
  const bw = Math.max(1, bx1 - bx0), bh = Math.max(1, by1 - by0);
  let landN = 0; for (let i = 0; i < 4000; i++) if (onLand(bx0 + rnd() * bw, by0 + rnd() * bh)) landN++;
  const S = SPEC[M.id];
  const isNative = !!S.nativeOnly;
  const landArea = (landN / 4000) * bw * bh;
  const k = isNative ? landArea / 300000 : landArea / (300000 * S.sx * S.sy);
  const nTown = Math.round((isNative ? 20 : 210) * k), nCave = Math.round((isNative ? 16 : 105) * k), nLair = Math.round((isNative ? 18 : 135) * k);
  const strong = M.id === 'lingjie' ? 1 : M.id === 'xianjie' ? 3 : 0;
  const LING_TOWNS = ['青灵坊', '玄晶驿', '风元集', '百灵坪', '天渊哨', '苍岩堡', '灵木寨', '避雷居', '玉泉坊', '金鹏驿', '飞灵镇', '青冥集', '玄矿寨', '紫霄坪', '万妖坊', '清微驿', '碎星堡', '灵谷镇', '玄玉集', '聚灵坊'];
  const LING_CAVES = ['古仙洞府', '化神坐化窟', '炼虚秘殿', '太古剑冢', '灵眼古窟', '残阵仙崖', '玄天残碑', '万木灵窟', '冰魄遗殿', '天雷古台', '星陨石室', '真灵蜕骨处'];
  const LING_LAIRS = ['魔渊斥候营', '噬灵虫谷', '赤焰鹰崖', '风狼幽涧', '玄冰兽巢', '铁犀荒原', '毒瘴古林', '血沼凶泽', '妖鹏峭壁', '冥煞深谷'];
  let tries = 0, vi = 0;
  while (out.filter((l) => l.type === 'town').length < nTown && tries++ < nTown * 50) {
    const x = bx0 + rnd() * bw, y = by0 + rnd() * bh;
    if (!onLand(x, y) || inLake(x, y) || !far(x, y, isNative ? 14 : 18)) continue;
    if (cold(x, y) && rnd() < 0.7) continue;
    const nat = rnd() < 0.3;
    const rawName = M.id === 'lingjie'
      ? LING_TOWNS[vi++ % LING_TOWNS.length]
      : (nat ? VNAT[vi++ % VNAT.length] : SURN[Math.floor(rnd() * SURN.length)] + VSUF[Math.floor(rnd() * VSUF.length)]);
    const name = uname(rawName);
    mk({ name, type: 'town', x, y, minor: true, danger: 0, desc: M.id === 'lingjie' ? (dry(x, y) ? '魔渊荒漠边缘的灵族哨卡，专供往来行商补给灵晶。' : cold(x, y) ? '极北冰原边缘的灵修营地，结丹与元婴修士在此避寒歇脚。' : '灵界灵脉庇护下的元婴、化神散修坊集，受附近大宗统辖。') : dry(x, y) ? '风沙中的小村落，村民以放牧为生。' : cold(x, y) ? '冰原边缘的猎户村落。' : isNative ? '上界灵脉庇护下的散修聚落。' : '凡人聚居的村落，鸡犬相闻，偶有修士路过歇脚。' });
  }
  tries = 0; let ci = 0;
  while (out.filter((l) => l.type === 'secret').length < nCave && tries++ < nCave * 80) {
    const x = bx0 + rnd() * bw, y = by0 + rnd() * bh;
    if (!onLand(x, y) || inLake(x, y) || !far(x, y, isNative ? 15 : 19)) continue;
    const [, oy] = fromMap(M.id, x, y);
    const north = !isNative && oy < 260 ? 1 : 0;
    const cname = M.id === 'lingjie' ? LING_CAVES[ci++ % LING_CAVES.length] : CAVES[ci++ % CAVES.length];
    mk({ name: uname(cname), type: 'secret', x, y, minor: true, danger: Math.min(6, 1 + strong + north + Math.floor(rnd() * 3)), desc: M.id === 'lingjie' ? '灵界前辈或太古异族遗留的秘窟，残存禁制中或许藏有灵界典籍与重宝。' : '前人留下的修炼之所或古迹，禁制残存，或有遗宝。' });
  }
  tries = 0; let li = 0;
  while (out.filter((l) => l.type === 'danger').length < nLair && tries++ < nLair * 80) {
    const x = bx0 + rnd() * bw, y = by0 + rnd() * bh;
    if (!onLand(x, y) || inLake(x, y) || !far(x, y, isNative ? 14 : 18)) continue;
    const [, oy] = fromMap(M.id, x, y);
    const north = !isNative && oy < 260 ? 1 : 0;
    const list = M.id === 'lingjie' ? LING_LAIRS : (cold(x, y) ? LAIRS_COLD : dry(x, y) ? LAIRS_DRY : LAIRS);
    mk({ name: uname(list[li++ % list.length]), type: 'danger', x, y, minor: true, danger: Math.min(6, 1 + strong + north + Math.floor(rnd() * 3)), desc: M.id === 'lingjie' ? '灵界妖兽与蛮荒散部盘踞之险地，往来猎妖取晶者络绎不绝。' : '妖兽盘踞之地，常有修士结伴前来猎妖取丹。' });
  }
  // 海岛据点与海妖巢穴（落在海中，岛屿由地形按 island 半径生成）
  if (M.islandField) {
    const F = M.islandField, islCap = isNative ? 38 : 68; tries = 0;
    while (out.filter((l) => l.type === 'isle' || l.island).length < islCap && tries++ < 6000) {
      const x = F.x0 + rnd() * (F.x1 - F.x0), y = F.y0 + rnd() * (F.y1 - F.y0);
      if (onLand(x, y) || !far(x, y, 20)) continue;
      const sea = rnd() < 0.35;
      const name = uname(sea ? LAIRS_SEA[Math.floor(rnd() * LAIRS_SEA.length)] : ['青螺岛', '碧波岛', '蛟龙屿', '落星岛', '珊瑚岛', '龟背岛', '望潮岛', '浮云岛', '金沙岛', '海市岛', '白沙屿', '星罗岛'][Math.floor(rnd() * 12)]);
      const outer = isNative ? true : toLegacy0(M.id, x, y)[0] > 900;
      mk({ name, type: sea ? 'danger' : 'isle', x, y, minor: true, island: Math.round((4 + rnd() * 4) * M.islandK), danger: sea ? Math.min(6, 2 + strong + (outer ? 1 : 0) + Math.floor(rnd() * 2)) : 0, desc: sea ? '海妖出没的礁岛。' : '海域中的小岛，散修在此结庐。' });
    }
  }
  return out;
}
function toLegacy0(id: MapId, x: number, y: number) { return fromMap(id, x, y); }

// ---------- 第四十五步：大湖、大江、湖心岛（由旧未扩图天南坐标等比折算到人界全境，再加入；旧存档的小地点 id 不变） ----------
function oldTnToRenjie(x: number, y: number): P { return toMap('renjie', x / TN_SX, y / TN_SX + 262); }
const TN_TO_RJ_R = 2.0 / TN_SX;
const NEW_LAKES: Partial<Record<MapId, { c: P; r: number; name?: string }[]>> = {
  renjie: [
    { c: oldTnToRenjie(585, 445), r: 24 * TN_TO_RJ_R, name: '云梦泽' }, { c: oldTnToRenjie(612, 430), r: 18 * TN_TO_RJ_R }, { c: oldTnToRenjie(565, 463), r: 14 * TN_TO_RJ_R }, { c: oldTnToRenjie(618, 458), r: 12 * TN_TO_RJ_R }, { c: oldTnToRenjie(600, 470), r: 10 * TN_TO_RJ_R },
    { c: oldTnToRenjie(745, 528), r: 12 * TN_TO_RJ_R, name: '镜湖' }, { c: oldTnToRenjie(733, 520), r: 8 * TN_TO_RJ_R }, { c: oldTnToRenjie(757, 536), r: 8 * TN_TO_RJ_R },
    { c: oldTnToRenjie(392, 450), r: 15 * TN_TO_RJ_R, name: '黑水泽' }, { c: oldTnToRenjie(402, 470), r: 10 * TN_TO_RJ_R },
    { c: oldTnToRenjie(700, 275), r: 16 * TN_TO_RJ_R, name: '碧落湖' }, { c: oldTnToRenjie(684, 268), r: 10 * TN_TO_RJ_R }, { c: oldTnToRenjie(716, 284), r: 9 * TN_TO_RJ_R },
    { c: oldTnToRenjie(128, 270), r: 12 * TN_TO_RJ_R, name: '翠竹湖' }, { c: oldTnToRenjie(138, 282), r: 7 * TN_TO_RJ_R },
  ],
};
const NEW_RIVERS: Partial<Record<MapId, { pts: P[]; w: number; name?: string }[]>> = {
  renjie: [
    // 沧澜江：出云梦泽，东南奔流入海——南荒第一大江
    { pts: [[612, 470], [630, 500], [650, 540], [668, 578], [686, 606], [705, 638]].map(([x, y]) => oldTnToRenjie(x, y)), w: 3.4 * TN_TO_RJ_R, name: '沧澜江' },
    // 白龙江：自北面大河分出，南注云梦泽
    { pts: [[574, 342], [584, 372], [592, 400], [598, 424]].map(([x, y]) => oldTnToRenjie(x, y)), w: 1.5 * TN_TO_RJ_R, name: '白龙江' },
    // 碧落河：出碧落湖，东流入海
    { pts: [[716, 286], [760, 292], [810, 287], [860, 296], [922, 302]].map(([x, y]) => oldTnToRenjie(x, y)), w: 1.7 * TN_TO_RJ_R, name: '碧落河' },
    // 翠竹溪：出翠竹湖，西流入海
    { pts: [[120, 272], [96, 262], [72, 258], [50, 250]].map(([x, y]) => oldTnToRenjie(x, y)), w: 1.1 * TN_TO_RJ_R },
  ],
};
const LAKE_ISLE_DATA: Partial<Record<MapId, { c: P; r: number }[]>> = {
  renjie: [
    { c: oldTnToRenjie(592, 447), r: 4.2 * TN_TO_RJ_R },
    { c: oldTnToRenjie(745, 527), r: 2.2 * TN_TO_RJ_R },
    { c: oldTnToRenjie(698, 274), r: 2.4 * TN_TO_RJ_R },
  ],
};
function addNewWater(M: MapData) {
  const nl = NEW_LAKES[M.id]; if (!nl) return;
  const nr = NEW_RIVERS[M.id] ?? [];
  M.lakes = M.lakes.concat(nl.map((l) => ({ c: l.c, r: l.r, name: l.name })));
  M.rivers = M.rivers.concat(nr.map((r) => ({ pts: r.pts, w: r.w })));
  for (const l of nl) if (l.name) M.labels.push({ name: l.name, at: [l.c[0], l.c[1] + 2], size: l.r >= 20 ? 2.1 : 1.4 });
  for (const r of nr) if (r.name) { const p = r.pts[Math.floor(r.pts.length / 2)]; M.labels.push({ name: r.name, at: [p[0] + 7, p[1]], size: r.w > 3 ? 1.6 : 1.1 }); }
  // 落入新湖的小地点挪到岸上（id、名字不变）
  const isl = LAKE_ISLE_DATA[M.id] ?? [];
  const wet = (x: number, y: number, pad: number) => nl.some((l) => Math.hypot(l.c[0] - x, l.c[1] - y) < l.r + pad); void isl;
  for (const L of M.locations) {
    if (!wet(L.x, L.y, 3)) continue;
    let best: P | null = null;
    for (let d = 2; d < 70 && !best; d += 1) for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2, x = L.x + Math.cos(a) * d, y = L.y + Math.sin(a) * d;
      if (!wet(x, y, 3.5) && M.mainland.length > 2 && pointInPoly(x, y, M.mainland)) { best = [x, y]; break; }
    }
    if (best) { L.x = best[0]; L.y = best[1]; const o = fromMap(M.id, L.x, L.y); L.ox = o[0]; L.oy = o[1]; }
  }
}

function buildMap(id: MapId, seed: number, pre: string): MapData {
  const S = SPEC[id], I = ISLES[id];
  const locations: LocDef[] = RAW_LOCATIONS.filter((l) => (l.map ?? legacyMapOf(l.x, l.y)) === id).map((l) => {
    const [x, y] = toMap(id, l.x, l.y);
    const islMul = id === 'renjie' ? (l.x >= 630 && l.y >= 290 && l.island >= 10 ? 1.6 : 1.35) : 1.2;
    return { ...l, map: id, x, y, ox: l.x, oy: l.y, island: l.island ? Math.round(l.island * islMul) : undefined };
  });
  let M: MapData;
  if (S.nativeOnly) {
    const ng = NATIVE_GEO[id]!;
    M = {
      id, W: S.W, H: S.H,
      mainland: ng.mainland, lakes: ng.lakes, ranges: ng.ranges, rivers: ng.rivers,
      arid: ng.arid, cold: ng.cold, forest: ng.forest,
      regions: ng.regions.map((r) => ({ ...r, labelSize: (r.labelSize ?? 1) * 1.2 })),
      labels: ng.labels.map((l) => ({ ...l })),
      locations, islandField: I.field ?? null, extraIslands: I.extra, islandK: I.rk,
    };
  } else {
    const x0 = S.ox - 3, y0 = S.oy - 3, x1 = S.ox + S.W / S.sx + 3, y1 = S.oy + S.H / S.sy + 3;   // legacy 窗口（略放宽，海岸线伸出图外）
    const T = (p: P): P => toMap(id, p[0], p[1]);
    const sk = Math.sqrt(S.sx * S.sy);
    const mainland = clipPoly(RAW_MAINLAND, x0, y0, x1, y1).map(T);
    const lakes = RAW_LAKES.filter((l) => l.c[0] > x0 && l.c[0] < x1 && l.c[1] > y0 && l.c[1] < y1).map((l) => ({ ...l, c: T(l.c), r: l.r * sk * 0.8 }));
    const ranges = RAW_RANGES.filter((r) => bboxHits(r.pts, x0, y0, x1, y1)).map((r) => ({ ...r, pts: r.pts.map(T), w: r.w * S.rangeK }));
    const rivers = RAW_RIVERS.filter((r) => bboxHits(r.pts, x0, y0, x1, y1)).concat(EXTRA_RIVERS[id] ?? []).map((r) => ({ ...r, pts: r.pts.map(T), w: r.w * S.riverK }));
    const zone = (zs: { pts: P[]; v: number }[]) => zs.filter((z) => bboxHits(z.pts, x0, y0, x1, y1)).map((z) => ({ ...z, pts: z.pts.map(T) }));
    const regions = RAW_REGIONS.filter((r) => (MAP_REGIONS[id] ?? []).includes(r.id)).map((r) => ({ ...r, pts: r.pts.map(T), label: r.label ? T(r.label) : undefined, labelSize: (r.labelSize ?? 1) * 1.3 }));
    if (id === 'renjie') {
      // 补全极西外海、南溟海、无边深海的域区覆蓋（按顺序匹配，越靠前越优先）
      regions.push(
        { id: 'jixi_waihai', name: '极西外海', parent: '无边海', pts: [[0, 320], [720, 320], [720, 1520], [0, 1520]], label: [340, 1140], labelSize: 2.0 },
        { id: 'nanming_hai', name: '南溟海', parent: '无边海', pts: [[0, 1480], [2720, 1480], [2720, S.H], [0, S.H]], label: [1580, 1980], labelSize: 2.4 },
        { id: 'wubian_deep', name: '无边深海', parent: '无边海', pts: [[0, 0], [S.W, 0], [S.W, S.H], [0, S.H]], label: [3140, 1360], labelSize: 2.6 },
      );
    }
    const labels = (MAP_LABELS[id] ?? []).map((l) => ({ ...l, at: T(l.at) }));
    M = { id, W: S.W, H: S.H, mainland, lakes, ranges, rivers, arid: zone(RAW_ARID), cold: zone(RAW_COLD), forest: zone(RAW_FOREST), regions, labels, locations, islandField: I.field ?? null, extraIslands: I.extra, islandK: I.rk };
  }
  M.locations.push(...genMinor(M, seed, pre));
  addNewWater(M);
  return M;
}
// 主要地点的默认危险度
for (const l of RAW_LOCATIONS) if (l.danger === undefined) {
  const high = l.map === 'lingjie' || l.map === 'xianjie';
  l.danger = l.type === 'danger' ? (high ? 5 : l.y < 260 || l.x > 900 ? 4 : 3) : l.type === 'secret' ? (high ? 4 : 3) : 0;
}

const MAPS: Record<MapId, MapData> = {
  renjie: buildMap('renjie', 31415, ''),
  lingjie: buildMap('lingjie', 51415, 'lj_'),
  xianjie: buildMap('xianjie', 61415, 'xj_'),
};
const M = MAPS[ACTIVE_MAP];

// ---------- 当前地图（各模块沿用旧的导出名） ----------
export const MACRO_W = M.W;
export const MACRO_H = M.H;
export const WORLD_W = MACRO_W * WORLD_SCALE;
export const WORLD_H = MACRO_H * WORLD_SCALE;
export const MAINLAND = M.mainland;
export const LAKES = M.lakes;
/** 第四十五步：湖心岛（在陆地掩码上补回的小块陆地） */
export const LAKE_ISLES: { c: P; r: number }[] = LAKE_ISLE_DATA[ACTIVE_MAP] ?? [];
export const RANGES = M.ranges;
export const RIVERS = M.rivers;
export const ARID_ZONES = M.arid;
export const COLD_ZONES = M.cold;
export const FOREST_ZONES = M.forest;
export const REGIONS = M.regions;
export const BIG_LABELS = M.labels;
export const ISLAND_FIELD = M.islandField;
export const EXTRA_ISLANDS = M.extraIslands;
export const ISLAND_K = M.islandK;
/** 当前地图上的地点 */
export const LOCATIONS: LocDef[] = M.locations;
/** 三界全部地点（用于名称查询、跨图 NPC 与传闻） */
export const ALL_LOCATIONS: LocDef[] = ALL_MAP_IDS.flatMap((m) => MAPS[m].locations);
export const LOC_BY_ID = new Map(ALL_LOCATIONS.map((l) => [l.id, l] as const));
/** 第三十步：地表地域底色——魔道宗门周边朱砂赤土（t=1），凶地 / 镇魔古山的灰紫阴土（t=2）。半径以原始图单位给，按本图缩放 */
const ZONE_DEF: [string, number, number][] = [
  ['guiling', 1, 30], ['hehuan', 1, 28], ['yuling', 1, 30], ['qianhuan', 1, 28], ['tiansha', 1, 30], ['yinluo', 1, 32],
  ['tianmo', 1, 26], ['jiyin', 1, 13],
  ['moyan', 1, 28], ['xuesha', 1, 28], ['motuo', 1, 24], ['dusheng', 1, 22],
  ['zhuimo', 2, 26], ['yinyang', 2, 16], ['kunwu', 2, 12],
  ['qingming_gz', 2, 30], ['jiaochi_zu', 1, 36], ['yeying_zu', 2, 28], ['ling_moyuan_liekou', 2, 36], ['manhuang_dujie', 2, 32],
  ['huijie_sl', 2, 42], ['huiyuan_shixi', 2, 48],
];
let zoneCache: { x: number; y: number; r: number; t: number }[] | null = null;
export function groundZones() {
  if (zoneCache) return zoneCache;
  const S = SPEC[ACTIVE_MAP], sk = Math.sqrt(S.sx * S.sy);
  zoneCache = [];
  for (const [id, t, r] of ZONE_DEF) {
    const l = M.locations.find((q) => q.id === id); if (!l) continue;
    zoneCache.push({ x: l.x * WORLD_SCALE, y: l.y * WORLD_SCALE, r: r * sk * WORLD_SCALE, t });
  }
  return zoneCache;
}
/** 某点的地域：0 无，1 魔道，2 阴地（取更强者），k=强度 0~1 */
export function zoneAt(x: number, y: number): { t: number; k: number } {
  let t = 0, k = 0;
  for (const z of groundZones()) { const d = Math.hypot(x - z.x, y - z.y) / z.r; const m = d < 0.25 ? 1 : d > 1 ? 0 : 1 - (d - 0.25) / 0.75; if (m > k) { k = m; t = z.t; } }
  return { t, k };
}
/** 当前地图上的地点（不在本图则 undefined）——凡要用坐标的地方都应该用它 */
export function locHere(id: string | undefined | null): LocDef | undefined { const l = id ? LOC_BY_ID.get(id) : undefined; return l && l.map === ACTIVE_MAP ? l : undefined; }
export function locsOf(map: MapId): LocDef[] { return MAPS[normalizeMapPick(map) ?? 'renjie'].locations; }
export function mapSize(map: MapId) { const m = MAPS[normalizeMapPick(map) ?? 'renjie']; return { W: m.W, H: m.H }; }
export function mapMainland(map: MapId) { return MAPS[normalizeMapPick(map) ?? 'renjie'].mainland; }
/** 地名（不在本图时冠以地图名，如“灵界全境·天渊城”） */
export function locLabel(id: string | undefined | null): string { const l = id ? LOC_BY_ID.get(id) : undefined; return l ? (l.map !== ACTIVE_MAP ? MAP_NAME[l.map] + '·' : '') + l.name : ''; }

/** 人界周围无边海海域分层：衡量点到人界主大陆/沧溟海包围盒的海域距离（宏观单位） */
export function endlessSeaZoneAt(wx: number, wy: number): { zone: 'coastal' | 'mid' | 'deep'; distM: number } {
  if (ACTIVE_MAP !== 'renjie') return { zone: 'coastal', distM: 0 };
  const mx = wx / WORLD_SCALE, my = wy / WORLD_SCALE;
  // 人界主体（主大陆 + 沧溟海群岛）粗略范围：x ∈ [700, 2710], y ∈ [140, 1520]
  const dx = mx < 700 ? 700 - mx : mx > 2710 ? mx - 2710 : 0;
  const dy = my < 140 ? 140 - my : my > 1520 ? my - 1520 : 0;
  const d = Math.hypot(dx, dy);
  if (d < 160) return { zone: 'coastal', distM: d };
  if (d < 520) return { zone: 'mid', distM: d };
  return { zone: 'deep', distM: d };
}

