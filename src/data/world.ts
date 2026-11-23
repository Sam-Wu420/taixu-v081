import { XSECTS } from './sects';
// 人界地理数据
// 坐标系：宏观坐标 1000 x 700，乘以 WORLD_SCALE 得到世界坐标（像素）
// 布局参考原设及网络流传的《太虚问道录》人界地图：
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
  { id: 'tianlan', name: '天穹草原', parent: '天穹草原', pts: [[60, 255], [680, 255], [640, 368], [60, 368]], label: [420, 342], labelSize: 1.6 },
  { id: 'dajin', name: '中州', parent: '中州', pts: [[0, 0], [820, 0], [820, 255], [0, 255]], label: [440, 120], labelSize: 2.4 },
  { id: 'luanxing_inner', name: '沧溟内海', parent: '沧溟海', pts: circlePts(815, 500, 105), label: [815, 560], labelSize: 1.2 },
  { id: 'luanxing_outer', name: '沧溟外海', parent: '沧溟海', pts: [[650, 290], [1000, 290], [1000, 700], [650, 700]], label: [930, 670], labelSize: 1.2 },
  { id: 'wubian', name: '无边海', parent: '无边海', pts: [[560, 260], [650, 260], [650, 700], [560, 700]], label: [610, 470], labelSize: 1.4 },
  { id: 'beihai', name: '北海', parent: '北海', pts: [[0, 0], [1000, 0], [1000, 290], [0, 290]], label: [880, 160], labelSize: 1.4 },
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
  label?: string; seal?: string; look?: 'tea' | 'post' | 'camp';
  /** 别界按种子造的大地点：都城、城、宗门、坊市（种类上海岛界都记作 isle，靠它分辨） */
  hub?: 'capital' | 'city' | 'sect' | 'market';
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
  { id: 'tianlan', map: 'dajin', name: '天穹圣殿', type: 'sect', x: 430, y: 300, major: true, desc: '朔漠法士的圣地，供奉天穹圣兽。' },
  { id: 'tuwu', map: 'dajin', name: '赤勒部落', type: 'town', x: 300, y: 300, desc: '草原游牧部族，与朔漠人世代争斗。' },
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
  { id: 'shuozhou', map: 'dajin', name: '朔州城', type: 'city', x: 374, y: 246, major: true, desc: '中州南疆的州城，舜江自天穹草原流入中州境内。' },
  { id: 'youzhou', name: '幽州城', type: 'city', x: 318, y: 118, desc: '中州北方重镇，北望雪岭，城中多猎妖修士与收购冰属材料的商号。' },
  { id: 'yunzhou', name: '云州城', type: 'city', x: 566, y: 150, desc: '中州东部大城，坊市繁华，常有世家子弟在此斗宝。' },
  { id: 'qinzhou', name: '秦州城', type: 'city', x: 236, y: 196, desc: '中州西陲州城，再往西便是风沙蔽日的西漠。' },
  { id: 'xiangzhou', name: '襄州城', type: 'city', x: 610, y: 236, desc: '中州南部商埠，与草原诸部互市。' },
  { id: 'jin_fangshi', name: '落霞坊市', type: 'town', x: 486, y: 214, desc: '中州散修聚集的坊市，丹药、法器、消息应有尽有，鱼龙混杂。' },
  { id: 'caojia', map: 'dajin', name: '曹家', type: 'town', x: 394, y: 238, desc: '朔州城外的凡人家族，世代经商，家中小姐曹惜容心地良善。' },
  // ===== 无边海 =====
  { id: 'xutian', name: '归墟殿', type: 'secret', x: 636, y: 352, major: true, island: 9, desc: '冰魄仙子所留的上古殿宇，每隔一段时间现世一次。内藏归墟鼎与补天丹，元婴老怪亦为之疯狂。' },
  // ===== 沧溟海 =====
  { id: 'tianxing', name: '观星城', type: 'city', x: 815, y: 500, major: true, island: 28, scale: 1.3, desc: '沧溟海第一大城，建于圣山之上，星罗殿总坛所在，星罗双圣坐镇。' },
  { id: 'chuansong_lx', map: 'luanxing', name: '摇光岛·上古传送阵', type: 'secret', x: 727, y: 476, major: true, desc: '摇光岛外荒礁上的上古传送阵，与南荒梁国的古阵遥相呼应。同样以大挪移令与灵石开启，可回南荒。' },
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
  // ===== v0.60：十五座新宗门（data/sects.ts） =====
  ...XSECTS.map((s): RawLoc => ({ id: s.id, name: s.name, type: 'sect', x: s.x, y: s.y, desc: s.desc, ...(s.major ? { major: true } : {}), ...(s.island ? { island: s.island } : {}), ...(s.map ? { map: s.map } : {}) })),
];


// ---------- 小地点名字表 ----------
import { yieldGrandSectGround } from './sectPlan';
import { mulberry32, shuffleWith } from '../core/rng';
import { clearCityGrounds, setRealmKind } from '../gfx/citySize';
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
    const sea = r.parent === '沧溟海' || r.parent === '无边海' || r.parent === '北海';
    if (onLand && (r.id === 'wubian' || r.id === 'beihai')) continue;
    if (!onLand && !sea) continue;
    if (pointInPoly(mx, my, r.pts)) return r;
  }
  return null;
}

/**
 * 第六轮返工：小地图、日期栏上的地区名。陆上的地区多边形没盖到的海岛（归墟殿岛在沧溟外海多边形的西缘外、南荒外海的小岛……）
 * 原来一律写「荒野」：先看是不是落在一座有名的岛上（地点自带的岛半径以内）——是就写这座岛上地点的名字（摇光岛、观星城、归墟殿），
 * 上一级写所在的海域；不在有名的岛上就写所在海域的名字；再不然取最近的一块地区（图边外的驿站、部落）；都不是才是荒野（返回 null）
 */
export function regionNameAt(mx: number, my: number, onLand: boolean): { name: string; parent: string } | null {
  const r = regionAt(mx, my, onLand);
  if (r && !(onLand && SEA_PARENT.has(r.parent))) return { name: r.name, parent: r.parent };
  if (!onLand) return null;
  const sea = r ?? regionAt(mx, my, false) ?? REGIONS.find((q) => (q.id === 'wubian' || q.id === 'beihai') && pointInPoly(mx, my, q.pts)) ?? null;
  let best: LocDef | null = null, bd = Infinity;
  for (const l of LOCATIONS) {
    if (!l.island) continue;
    const d = Math.hypot(l.x - mx, l.y - my);
    if (d < l.island * 1.25 + 2 && d < bd) { bd = d; best = l; }
  }
  if (best) return { name: best.name, parent: sea?.name ?? MAP_NAME[ACTIVE_MAP] };
  if (sea) return { name: sea.name, parent: sea.parent };
  // 都没盖到（图边外的驿站、草原部落，外海边上的礁、集）：取离得最近的那一块地区（多边形边上量），四百宏观单位以内（草原深处的部落离天穹的边也有两三百）
  let near: Region | null = null, nd = 400;
  for (const q of REGIONS) {
    const P = q.pts;
    for (let i = 0; i < P.length; i++) {
      const [ax, ay] = P[i], [bx, by] = P[(i + 1) % P.length], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((mx - ax) * dx + (my - ay) * dy) / L2)), d = Math.hypot(mx - ax - dx * t, my - ay - dy * t);
      if (d < nd) { nd = d; near = q; }
    }
  }
  return near ? { name: near.name, parent: near.parent } : null;
}
const SEA_PARENT = new Set(['沧溟海', '无边海', '北海']);

export const LOC_TYPE_NAME: Record<LocType, string> = {
  city: '城池', town: '集镇', sect: '宗门', danger: '险地', secret: '秘境', isle: '海岛', inn: '驿站',
};


// =====================================================================================
// 第十六步：三张地图
// =====================================================================================
/** 人界的三张图，以及别界的图（'realm-N'：第一次用到时按种子现造，见 ensureMap） */
export type MapId = 'tiannan' | 'luanxing' | 'dajin' | `realm-${number}`;
export const MAP_IDS: MapId[] = ['tiannan', 'luanxing', 'dajin'];
export const MAP_NAME: Record<MapId, string> = { tiannan: '南荒', luanxing: '沧溟海', dajin: '中州' };

/**
 * 南荒放大的倍数（2026-11-14，用户定）：城要做到「成片街坊」的规模、宗门要占一整座山，原先的南荒太挤——
 * 有名的大地点之间中位只隔一万九千，放不下一万六见方的城。所以把南荒的格子数翻倍（每格仍是 300），
 * 相邻地点之间的距离跟着翻倍；村镇、洞府、巢穴的数量按陆地面积自动变成四倍，不会变空。中州、沧溟海本来就疏，不动。
 * 凡是直接用「南荒新图坐标」写死的数据（新增的湖与江、外海小岛、名胜）都乘这个数。
 */
export const TN_K: number = 2;
/** 每张图：取旧版统一地图上的一块（legacy 坐标）平移 + 缩放，铺满整张新图 */
interface MapSpec { ox: number; oy: number; sx: number; sy: number; W: number; H: number; rangeK: number; riverK: number }
const SPEC: Record<MapId, MapSpec> = {
  // 南荒：原先只占统一地图西南一隅（约 620 × 430），现在线性放大 1.6 倍，独占整张 1000 × 700 的大图
  tiannan: { ox: 0, oy: 262, sx: 1.6 * TN_K, sy: 1.6 * TN_K, W: 1000 * TN_K, H: 700 * TN_K, rangeK: 1.3 * TN_K, riverK: 1.25 },
  // 沧溟海：内沧溟外海与无边海东缘，放大 2 倍，岛屿星罗棋布
  luanxing: { ox: 600, oy: 280, sx: 2.0, sy: 2.0, W: 800, H: 840, rangeK: 1, riverK: 1 },
  // 中州：人界第一大国 + 北寒雪原 + 天穹草原北部；面积约为南荒的 1.5 倍
  dajin: { ox: 0, oy: 0, sx: 1.46, sy: 2.65, W: 1200, H: 880, rangeK: 1.5, riverK: 1.25 },
};
export function toMap(id: MapId, x: number, y: number): P { const s = SPEC[id]; return [(x - s.ox) * s.sx, (y - s.oy) * s.sy]; }
export function fromMap(id: MapId, x: number, y: number): P { const s = SPEC[id]; return [x / s.sx + s.ox, y / s.sy + s.oy]; }

function pickMap(): MapId {
  const ok = (v: unknown): v is MapId => v === 'tiannan' || v === 'luanxing' || v === 'dajin';
  try { const v = (globalThis as any).__TAIXU_MAP; if (ok(v)) return v; } catch { /* */ }
  try { const v = (globalThis as any).process?.env?.TAIXU_MAP; if (ok(v)) return v; } catch { /* */ }
  try { const v = new URLSearchParams(location.search).get('map'); if (ok(v)) return v; } catch { /* */ }
  try { const v = localStorage.getItem('taixu.map'); if (ok(v)) return v; } catch { /* */ }
  return 'tiannan';
}
/**
 * 当前所在的地图。可以在游戏里切换（setActiveMap）：下面「当前地图」那一组导出都是活的绑定，换图后各处读到的就是新图的数据。
 * 所以别处不要在模块加载时把它们存进自己的常量——用的时候再读。
 */
export let ACTIVE_MAP: MapId = pickMap();

/** 旧版统一地图上的一点属于哪张新图 */
export function legacyMapOf(x: number, y: number): MapId {
  if (x >= 600 && !pointInPoly(x, y, RAW_MAINLAND)) return 'luanxing';
  if (y < 262) return 'dajin';
  return 'tiannan';
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
  // 舜江：自天穹草原北流入中州朔州（原设苏寒冰封漂流之江）
  dajin: [{ pts: [[452, 330], [430, 312], [404, 292], [384, 274], [370, 258], [352, 236], [330, 214], [318, 200]], w: 1.3 }],
};
// 大区域标签（legacy 坐标；size 为新图宏观单位下的字号系数）
const MAP_LABELS: Record<MapId, { name: string; at: P; size: number }[]> = {
  tiannan: [{ name: '南荒', at: [330, 520], size: 6.5 }, { name: '朔漠草原', at: [420, 296], size: 3.6 }, { name: '极西之地', at: [62, 470], size: 3 }],
  luanxing: [{ name: '沧溟海', at: [822, 420], size: 6 }, { name: '沧溟内海', at: [815, 530], size: 3 }, { name: '沧溟外海', at: [935, 650], size: 3 }, { name: '无边海', at: [626, 520], size: 2.6 }],
  dajin: [{ name: '中州', at: [430, 150], size: 7.5 }, { name: '北寒雪原', at: [300, 66], size: 3.4 }, { name: '天穹草原', at: [470, 304], size: 3.6 }],
};
const MAP_REGIONS: Record<MapId, string[]> = {
  tiannan: ['yue', 'yuanwu', 'cheqi', 'zijin', 'tiandao', 'zhuimo', 'modao', 'jiuguo', 'jixi', 'tianlan', 'wubian'],
  luanxing: ['luanxing_inner', 'luanxing_outer', 'wubian'],
  dajin: ['dajin', 'tianlan', 'beihai'],
};
// 南荒一侧的“天穹草原”南部其实是与南荒结盟的朔漠人的地盘
const REGION_RENAME: Partial<Record<MapId, Record<string, { id: string; name: string; parent: string }>>> = {
  tiannan: { tianlan: { id: 'mulan', name: '朔漠草原', parent: '朔漠草原' } },
};
// 随机小岛：沧溟海星罗棋布；南荒东、南外海与中州北海零星点缀（新图宏观坐标）
const ISLES: Record<MapId, { field?: { x0: number; y0: number; x1: number; y1: number; count: number }; extra: { x0: number; y0: number; x1: number; y1: number; n: number; r0: number; r1: number }[]; rk: number }> = {
  tiannan: { extra: [{ x0: 940, y0: 120, x1: 996, y1: 690, n: 18, r0: 1.2, r1: 3.6 }, { x0: 80, y0: 668, x1: 900, y1: 696, n: 12, r0: 1.2, r1: 3 }], rk: 1 },
  luanxing: { field: { x0: 110, y0: 30, x1: 792, y1: 832, count: 520 }, extra: [{ x0: 6, y0: 20, x1: 100, y1: 830, n: 30, r0: 1.2, r1: 3.2 }], rk: 1.5 },
  dajin: { extra: [{ x0: 30, y0: 6, x1: 1170, y1: 66, n: 22, r0: 1.5, r1: 4 }], rk: 1 },
};

export interface MapExit { edge: 'n' | 's' | 'e' | 'w'; to: MapId; days: number; title: string; text: string }
/** 走到地图边缘可前往的相邻地图（陆路）。沧溟海只能经上古传送阵往来 */
export const MAP_EXITS: Record<MapId, MapExit[]> = {
  tiannan: [{ edge: 'n', to: 'dajin', days: 120, title: '北上中州', text: '再往北，便是赤勒人的天穹草原。横穿草原、顺舜江而下，就是人界第一大国——中州。\n\n此去路途遥远，少说也要四个月；天穹圣殿高手如云，草原上元婴修士亦不罕见。' }],
  dajin: [{ edge: 's', to: 'tiannan', days: 120, title: '南下南荒', text: '向南穿过天穹草原与朔漠草原，便回到南荒。路途约需四个月。' }],
  luanxing: [],
};
/**
 * 交界地带：相邻两张图之间可以直接飞越的一片连续的地面（南荒北缘 ⇄ 中州南缘，中间是天穹草原）。
 * 两张图各自保留自己的坐标，交界地带接在各自的边外；飞过中线时悄悄换图，坐标只差一个固定的平移。
 * 「交界坐标系」取南荒的坐标：南荒 shift = 0，中州的坐标 = 交界坐标 + shift。
 * 深度须使 shift 是地面分块边长（1024）和地表网格步长（64）的整数倍：中州高 880×300 = 264000，加 120000 得 384000 = 375×1024。
 */
export const SEAM_DEPTH = 120000;
/** 中州的西缘在大陆坐标（南荒坐标）里的 x：中州的 x = 大陆坐标 x − 这个数 */
export const DAJIN_WEST = 219136;
/**
 * 无边海有多宽（南荒东缘 ⇄ 沧溟海西缘）。同样要让平移是 1024 的整数倍：南荒宽 600000，加 151616 得 751616 = 734×1024。
 * 沧溟海比南荒偏南 83968（82×1024）：正对着南荒东岸的中段。
 */
export const SEA_DEPTH = 151616;
export const SEA_NORTH = -83968;
export type SeamSide = 'n' | 's' | 'e' | 'w';
/** 一条可以直接飞越（陆路还能走过去）的交界：本图的哪条边、通往哪张图、有多深、叫什么、横穿折算多少天 */
export interface MapSeam { side: SeamSide; to: MapId; depth: number; name: string; days: number; sea?: boolean }
/**
 * 「大陆坐标」取南荒的坐标。每张图自己的坐标 = 大陆坐标 + (dx, dy)。
 * 交界地带（草原、无边海）的地貌一律按大陆坐标算，所以从哪张图看过去都是同一片地。
 */
export const MAP_FRAME: Partial<Record<MapId, { dx: number; dy: number }>> = {
  tiannan: { dx: 0, dy: 0 },
  // 东西方向错开 219136（214×1024）：南荒放大后，它北缘的朔漠草原（约 x=40 万）要正对着中州南缘的天穹草原（约 x=18 万）
  dajin: { dx: -DAJIN_WEST, dy: 880 * WORLD_SCALE + SEAM_DEPTH },
  luanxing: { dx: -(SPEC.tiannan.W * WORLD_SCALE + SEA_DEPTH), dy: SEA_NORTH },
};
export const MAP_SEAMS: Partial<Record<MapId, MapSeam[]>> = {
  tiannan: [
    { side: 'n', to: 'dajin', depth: SEAM_DEPTH, name: '天穹草原', days: 120 },
    { side: 'e', to: 'luanxing', depth: SEA_DEPTH, name: '无边海', days: 180, sea: true },
  ],
  dajin: [{ side: 's', to: 'tiannan', depth: SEAM_DEPTH, name: '天穹草原', days: 120 }],
  luanxing: [{ side: 'w', to: 'tiannan', depth: SEA_DEPTH, name: '无边海', days: 180, sea: true }],
};
const NO_FRAME = { dx: 0, dy: 0 };
export function mapFrame(map: MapId) { return MAP_FRAME[map] ?? NO_FRAME; }
export function seamsOf(map: MapId): readonly MapSeam[] { return MAP_SEAMS[map] ?? []; }
/** 这条交界里两张图都有的那一段（沿着边的方向，本图坐标，世界单位）：出了这一段，那截边照旧不通 */
export function seamSpan(map: MapId, S: MapSeam): [number, number] {
  const a = mapFrame(map), b = mapFrame(S.to), A = mapSize(map), B = mapSize(S.to);
  if (S.side === 'n' || S.side === 's') return [Math.max(0, a.dx - b.dx), Math.min(A.W * WORLD_SCALE, B.W * WORLD_SCALE + a.dx - b.dx)];
  return [Math.max(0, a.dy - b.dy), Math.min(A.H * WORLD_SCALE, B.H * WORLD_SCALE + a.dy - b.dy)];
}
/** 人在这条交界里走出去多深（世界单位）：在图内为负 */
export function seamOut(map: MapId, S: MapSeam, x: number, y: number): number {
  const A = mapSize(map);
  return S.side === 'n' ? -y : S.side === 's' ? y - A.H * WORLD_SCALE : S.side === 'w' ? -x : x - A.W * WORLD_SCALE;
}
/**
 * 天穹草原上的商道（大陆坐标的折线）：从南荒北缘一路向北到中州南缘。徒步的人顺着它走，沿途有驿站和部落的营地。
 */
export const SEAM_ROAD: readonly (readonly [number, number])[] = [
  [398000, 2400], [400500, -9000], [396000, -22000], [402000, -36000], [408500, -50000], [404000, -64000],
  [397500, -78000], [401000, -92000], [407000, -106000], [403000, -118000], [400000, -124000],
];
export const EDGE_BLOCK_TEXT: Record<MapId, string> = {
  tiannan: '前方是茫茫无边海，再往外已无陆地可依。要去沧溟海，可从东面出海一路向东硬飞，或借梁京城外灵石矿洞中的上古传送阵。',
  luanxing: '再往外便是无尽深海，妖兽横行、风暴不息，连元婴修士也不敢深入。回南荒可从西面出海一路向西，或借摇光岛的上古传送阵。',
  dajin: '前方已是人界尽头的荒寒之地，风雪如刀，再走下去有死无生。',
};
/** 传送阵：两端地点 id */
export const PORTALS: { a: string; b: string; minRealm: number; cost: number; token: string }[] = [
  { a: 'chuansong', b: 'chuansong_lx', minRealm: 2, cost: 600, token: 'tok_danuoyi' },
];

// ---------- 程序生成的小地点 ----------
/** 整张图的色调：地面、水面各往一个颜色上偏（炎墟的焦土与熔岩、幽冥的紫灰与黑水） */
export interface MapTint { land: [number, number, number]; sea: [number, number, number]; k: number }
export interface MapData {
  tint?: MapTint;
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
  // 陆地面积（决定小地点数量，使各图密度一致）
  let landN = 0; for (let i = 0; i < 4000; i++) if (onLand(rnd() * M.W, rnd() * M.H)) landN++;
  const landArea = (landN / 4000) * M.W * M.H, k = landArea / 300000;   // 旧版统一地图主大陆 ≈ 30 万平方宏观单位
  const nTown = Math.round(150 * k), nCave = Math.round(72 * k), nLair = Math.round(95 * k);
  const strong = M.id === 'dajin' ? 1 : 0;
  let tries = 0, vi = 0;
  while (out.filter((l) => l.type === 'town').length < nTown && tries++ < nTown * 50) {
    const x = 10 + rnd() * (M.W - 20), y = 10 + rnd() * (M.H - 20);
    if (!onLand(x, y) || inLake(x, y) || !far(x, y, 11)) continue;
    if (cold(x, y) && rnd() < 0.7) continue;
    const nat = rnd() < 0.3;
    const name = uname(nat ? VNAT[vi++ % VNAT.length] : SURN[Math.floor(rnd() * SURN.length)] + VSUF[Math.floor(rnd() * VSUF.length)]);
    mk({ name, type: 'town', x, y, minor: true, danger: 0, desc: dry(x, y) ? '风沙中的小村落，村民以放牧为生。' : cold(x, y) ? '冰原边缘的猎户村落。' : '凡人聚居的村落，鸡犬相闻，偶有修士路过歇脚。' });
  }
  tries = 0; let ci = 0;
  while (out.filter((l) => l.type === 'secret').length < nCave && tries++ < nCave * 80) {
    const x = 10 + rnd() * (M.W - 20), y = 10 + rnd() * (M.H - 20);
    if (!onLand(x, y) || inLake(x, y) || !far(x, y, 12)) continue;
    mk({ name: uname(CAVES[ci++ % CAVES.length]), type: 'secret', x, y, minor: true, danger: 1 + strong + Math.floor(rnd() * 3), desc: '前人留下的修炼之所或古迹，禁制残存，或有遗宝。' });
  }
  tries = 0; let li = 0;
  while (out.filter((l) => l.type === 'danger').length < nLair && tries++ < nLair * 80) {
    const x = 10 + rnd() * (M.W - 20), y = 10 + rnd() * (M.H - 20);
    if (!onLand(x, y) || inLake(x, y) || !far(x, y, 11)) continue;
    const list = cold(x, y) ? LAIRS_COLD : dry(x, y) ? LAIRS_DRY : LAIRS;
    mk({ name: uname(list[li++ % list.length]), type: 'danger', x, y, minor: true, danger: 1 + strong + Math.floor(rnd() * 3), desc: '妖兽盘踞之地，常有修士结伴前来猎妖取丹。' });
  }
  // 沧溟海：小岛据点与海妖巢穴（落在海中，岛屿由地形按 island 半径生成）
  if (M.islandField) {
    const F = M.islandField; tries = 0;
    while (out.filter((l) => l.type === 'isle' || l.island).length < 72 && tries++ < 6000) {
      const x = F.x0 + rnd() * (F.x1 - F.x0), y = F.y0 + rnd() * (F.y1 - F.y0);
      if (onLand(x, y) || !far(x, y, 16)) continue;
      const sea = rnd() < 0.35;
      const name = uname(sea ? LAIRS_SEA[Math.floor(rnd() * LAIRS_SEA.length)] : ['青螺岛', '碧波岛', '蛟龙屿', '落星岛', '珊瑚岛', '龟背岛', '望潮岛', '浮云岛', '金沙岛', '海市岛', '白沙屿', '星罗岛'][Math.floor(rnd() * 12)]);
      const outer = toLegacy0(M.id, x, y)[0] > 900;
      mk({ name, type: sea ? 'danger' : 'isle', x, y, minor: true, island: Math.round((4 + rnd() * 4) * M.islandK), danger: sea ? 2 + (outer ? 1 : 0) + Math.floor(rnd() * 2) : 0, desc: sea ? '海妖出没的礁岛。' : '沧溟海中的小岛，散修在此结庐。' });
    }
  }
  return out;
}
function toLegacy0(id: MapId, x: number, y: number) { return fromMap(id, x, y); }
/**
 * 城池四周的村镇：人烟是围着城聚的——国都外一圈集镇、再一圈村落，大城次之，小城也有几处。
 * （genMinor 的小村落是满图均匀撒的，看不出哪儿是腹地、哪儿是边荒。）在 genMinor 和新水系之后加入，id 另起一串，旧存档的小地点 id 不变。
 */
function genSatellites(M: MapData, seed: number, pre: string): LocDef[] {
  let st = (Math.imul(seed, 2654435761) ^ 0x5a17) >>> 0;
  const rnd = () => { st = (Math.imul(st, 1664525) + 1013904223) >>> 0; return st / 4294967296; };
  const out: LocDef[] = [], used = new Set<string>(M.locations.map((l) => l.name));
  const onLand = (x: number, y: number) => M.mainland.length > 2 && pointInPoly(x, y, M.mainland);
  const inLake = (x: number, y: number) => M.lakes.some((l) => Math.hypot(x - l.c[0], y - l.c[1]) < l.r + 2);
  for (const c of M.locations.filter((l) => l.type === 'city' && !l.minor)) {
    const capital = c.id === 'jinjing' || c.id === 'yuejing', n = capital ? 11 : c.major ? 8 : 5, r0 = capital ? 19 : c.major ? 16 : 13;
    let placed = 0;
    for (let t = 0; t < n * 40 && placed < n; t++) {
      const ring = placed < Math.ceil(n * 0.4) ? 0 : 1, a = rnd() * Math.PI * 2, r = r0 + ring * 10 + rnd() * 6;
      const x = c.x + Math.cos(a) * r, y = c.y + Math.sin(a) * r * 0.85;
      if (x < 8 || y < 8 || x > M.W - 8 || y > M.H - 8 || !onLand(x, y) || inLake(x, y)) continue;
      if (M.locations.some((l) => l !== c && Math.hypot(l.x - x, l.y - y) < (l.minor ? 6 : 14)) || out.some((l) => Math.hypot(l.x - x, l.y - y) < 6.5)) continue;
      const big = ring === 0 && placed < (capital ? 3 : c.major ? 2 : 1);
      let name = '';
      for (let k = 0; k < 30 && (!name || used.has(name)); k++) name = SURN[Math.floor(rnd() * SURN.length)] + (big ? ['家镇', '集', '家集', '店'][Math.floor(rnd() * 4)] : VSUF[Math.floor(rnd() * VSUF.length)]);
      if (used.has(name)) name += out.length;
      used.add(name);
      const [ox, oy] = fromMap(M.id, x, y);
      out.push({ id: pre + 's' + out.length, name, type: 'town', x, y, minor: true, danger: 0, map: M.id, ox, oy,
        desc: big ? `${c.name}外的集镇，往来客商在此歇脚、交割货物。` : `${c.name}郊外的村落，田垄相连，炊烟相望。` });
      placed++;
    }
  }
  return out;
}

/**
 * 路上和边地的人烟（在 genSatellites 之后加入，id 另起几串，旧存档的地点 id 不变）：
 *   · 大路中段的茶寮、驿站——两座城之间隔得远，走到半道有个歇脚的地方；
 *   · 草原上游牧部落的营地（图内的朔漠草原、天穹草原，以及两图之间那一大片）；
 *   · 天穹草原商道上的驿站；无边海上几座可以落脚的岛。
 * 图外的地点坐标落在地图矩形之外（北面是负的纵坐标，等等）；它们按大陆坐标摆在交界地带里，
 * 中线两侧各留出一段不放（飞过中线换图时，眼前不能有只属于一张图的东西）。
 */
const TRIBE_A = ['乌', '苍', '白', '赤', '黑', '金', '铁', '朔', '青', '雪', '玄', '赭', '黄', '紫', '灰', '长', '孤'], TRIBE_B = ['兰', '狼', '鹿', '勒', '鹫', '水', '风', '驹', '蹄', '驼', '石', '羊', '鹰', '河', '山', '月', '雁', '弓', '烟'];
/** 部落的名字：两个字拼出来，几百个里不重样 */
const tribe = (k: number) => TRIBE_A[(k * 7 + 3) % TRIBE_A.length] + TRIBE_B[(k * 11 + Math.floor(k / TRIBE_A.length) * 5) % TRIBE_B.length];
const STEPPE_POSTS = ['出塞驿', '白草驿', '饮马驿', '风砾驿', '石堆驿', '望乡驿', '孤烟驿', '雁回驿', '长河驿', '入关驿'];
/** 无边海上的岛（大陆坐标，世界单位；半径是世界单位）。地形在 outland.ts 里照着这张表隆起 */
export const SEA_ISLES: readonly { id: string; name: string; x: number; y: number; r: number; desc: string }[] = [
  { id: 'wangxiang', name: '望乡屿', x: 636000, y: 196000, r: 2600, desc: '出南荒东海后的第一处落脚地。岛上只有一座渔村和一盏长明的灯塔，远航的人在此回望故土。' },
  { id: 'bantu', name: '沉星岛', x: 652000, y: 262000, r: 3400, desc: '无边海上少有的大岛。传说曾有星辰坠落于此，岛心的深潭至今寒气逼人；往来两地的修士多在此歇脚、交换消息。' },
  { id: 'yingxing', name: '迎星礁', x: 708000, y: 226000, r: 2400, desc: '沧溟海最西的一处礁岛。再往东，星罗棋布的岛屿便一座接一座地浮出海面。' },
  { id: 'guixu', name: '归墟集', x: 721000, y: 168000, r: 3000, desc: '外海散修自发聚起的海市。来自南荒的货物与沧溟海的妖丹在这里换手，价钱比两头都公道。' },
];
function genFrontier(M: MapData, seed: number, pre: string): LocDef[] {
  let st = (Math.imul(seed, 40503) ^ 0x7f4a7c15) >>> 0;
  const rnd = () => { st = (Math.imul(st, 1664525) + 1013904223) >>> 0; return st / 4294967296; };
  const out: LocDef[] = [], used = new Set<string>(M.locations.map((l) => l.name));
  const onLand = (x: number, y: number) => M.mainland.length > 2 && pointInPoly(x, y, M.mainland);
  const inLake = (x: number, y: number) => M.lakes.some((l) => Math.hypot(x - l.c[0], y - l.c[1]) < l.r + 2);
  const clear = (x: number, y: number, d: number) => !M.locations.some((l) => Math.hypot(l.x - x, l.y - y) < d) && !out.some((l) => Math.hypot(l.x - x, l.y - y) < d);
  const mk = (tag: string, l: Omit<LocDef, 'id' | 'map' | 'ox' | 'oy'>) => {
    let name = l.name;
    for (const pre of ['东', '西', '南', '北', '上', '下', '左', '右']) { if (!used.has(name)) break; name = pre + l.name; }
    if (used.has(name)) name += out.length;
    used.add(name);
    const [ox, oy] = fromMap(M.id, l.x, l.y);
    out.push({ ...l, name, id: pre + tag + out.filter((o) => o.id.startsWith(pre + tag)).length, map: M.id, ox, oy });
  };
  // ---- 大路中段的茶寮、驿站
  const hubs = M.locations.filter((l) => !l.minor && !l.island && (l.type === 'city' || l.type === 'town' || l.type === 'sect') && onLand(l.x, l.y));
  let inns = 0;
  for (let i = 0; i < hubs.length && inns < 60; i++) for (let j = i + 1; j < hubs.length && inns < 60; j++) {
    const a = hubs[i], b = hubs[j], d = Math.hypot(a.x - b.x, a.y - b.y);
    const dk = M.id === 'tiannan' ? TN_K : 1;
    if (d < 26 * dk || d > 95 * dk) continue;
    // 只取彼此是近邻的一对（中间没有别的城镇），免得一条路上挤好几家
    if (hubs.some((c) => c !== a && c !== b && Math.hypot(c.x - a.x, c.y - a.y) < d * 0.8 && Math.hypot(c.x - b.x, c.y - b.y) < d * 0.8)) continue;
    const t = 0.42 + rnd() * 0.16, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
    if (!onLand(x, y) || inLake(x, y) || !clear(x, y, 7)) continue;
    const post = (inns++ % 3) === 1;
    mk('r', post
      ? { name: a.name.slice(0, 2).replace(/[城门宗谷山]$/, '') + b.name[0] + '驿', type: 'inn', look: 'post', x, y, minor: true, danger: 0, desc: `${a.name}与${b.name}之间的官驿，换马、歇脚、递送文书。` }
      : { name: SURN[Math.floor(rnd() * SURN.length)] + ['记茶寮', '家茶棚', '家老店'][Math.floor(rnd() * 3)], type: 'inn', look: 'tea', x, y, minor: true, danger: 0, desc: `${a.name}往${b.name}的半道上，一间卖茶水和粗饭的小店，过路人在这儿打听消息。` });
  }
  // ---- 图内的草原：部落的营地
  const steppe = M.regions.filter((r) => /草原/.test(r.name));
  let ti = M.id === 'dajin' ? 40 : 0;
  for (const R of steppe) {
    const xs = R.pts.map((p) => p[0]), ys = R.pts.map((p) => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    for (let t = 0, n = 0; t < 600 && n < 12; t++) {
      const x = x0 + rnd() * (x1 - x0), y = y0 + rnd() * (y1 - y0);
      if (x < 8 || y < 8 || x > M.W - 8 || y > M.H - 8 || !pointInPoly(x, y, R.pts) || !onLand(x, y) || inLake(x, y) || !clear(x, y, 11)) continue;
      mk('c', { name: tribe(ti++) + '部', type: 'town', look: 'camp', x, y, minor: true, danger: 0, desc: '逐水草而居的游牧部落。毡帐围成一圈，中间是议事的金顶大帐；外人来了，先喝三碗马奶酒。' });
      n++;
    }
  }
  // ---- 图外：两图之间的天穹草原（商道上的驿站、散落的营地）、无边海上的岛
  const F = MAP_FRAME[M.id];
  if (F && (M.id === 'tiannan' || M.id === 'dajin')) {
    const mine = (hy: number) => M.id === 'tiannan' ? hy > -SEAM_DEPTH / 2 + 12000 && hy < -6500 : hy < -SEAM_DEPTH / 2 - 12000 && hy > -SEAM_DEPTH + 6500;
    const at = (hx: number, hy: number): [number, number] => [(hx + F.dx) / WORLD_SCALE, (hy + F.dy) / WORLD_SCALE];
    const roadX = (hy: number) => { for (let i = 0; i < SEAM_ROAD.length - 1; i++) { const a = SEAM_ROAD[i], b = SEAM_ROAD[i + 1]; if (hy <= a[1] && hy >= b[1]) return a[0] + (b[0] - a[0]) * (a[1] - hy) / (a[1] - b[1]) - Math.sin(hy / 2100) * 260; } return 400000; };
    let pi = 0;
    for (let hy = -11000; hy > -SEAM_DEPTH + 6000; hy -= 12500, pi++) {
      if (!mine(hy)) continue;
      const [x, y] = at(roadX(hy) + (pi % 2 ? -430 : 430), hy);
      mk('o', { name: STEPPE_POSTS[pi % STEPPE_POSTS.length], type: 'inn', look: 'post', x, y, minor: true, danger: 0, desc: '天穹草原商道上的驿站。南来北往的驼队在此饮马过夜，墙上钉满了各部落的箭和商号的木牌。' });
    }
    // 营地：一样的随机数两张图各走一遍，各取自己那一半（所以两张图合起来是一整片）
    let sp = 0x51ed270b;
    const r2 = () => { sp = (Math.imul(sp, 1664525) + 1013904223) >>> 0; return sp / 4294967296; };
    const camps: [number, number][] = [];
    for (let t = 0; t < 1200 && camps.length < 46; t++) {
      const hx = DAJIN_WEST + 12000 + r2() * 306000, hy = -6500 - r2() * (SEAM_DEPTH - 13000);
      if (Math.abs(hx - roadX(hy)) < 2600 || camps.some((c) => Math.hypot(c[0] - hx, c[1] - hy) < 15000)) continue;
      camps.push([hx, hy]);
    }
    camps.forEach(([hx, hy], i) => {
      if (!mine(hy)) return;
      const [x, y] = at(hx, hy), big = i % 7 === 0;
      mk('o', { name: tribe(100 + i) + (big ? '王帐' : '部'), type: 'town', look: 'camp', major: big || undefined, x, y, minor: true, danger: 0,
        desc: big ? '草原上一个大部族的王帐所在。金顶大帐周围毡帐连营，四方小部落的头人都要来此朝见。' : '天穹草原上的游牧部落，赶着马群和羊群四季迁徙。' });
    });
  }
  if (F && (M.id === 'tiannan' || M.id === 'luanxing')) {
    const mid = SPEC.tiannan.W * WORLD_SCALE + SEA_DEPTH / 2;
    for (const s of SEA_ISLES) {
      if (M.id === 'tiannan' ? s.x > mid - 9000 : s.x < mid + 9000) continue;
      const [ox, oy] = fromMap(M.id, (s.x + F.dx) / WORLD_SCALE, (s.y + F.dy) / WORLD_SCALE);
      out.push({ id: s.id, name: s.name, type: 'isle', x: (s.x + F.dx) / WORLD_SCALE, y: (s.y + F.dy) / WORLD_SCALE, minor: s.r < 3000 || undefined, danger: 0, desc: s.desc, map: M.id, ox, oy });
    }
  }
  return out;
}

// ---------- 第四十五步：大湖、大江、湖心岛（新图坐标，宏观单位；在 genMinor 之后加入，旧存档的小地点 id 不变） ----------
const NEW_LAKES: Partial<Record<MapId, { c: P; r: number; name?: string }[]>> = {
  tiannan: [
    { c: [585, 445], r: 24, name: '云梦泽' }, { c: [612, 430], r: 18 }, { c: [565, 463], r: 14 }, { c: [618, 458], r: 12 }, { c: [600, 470], r: 10 },
    { c: [745, 528], r: 12, name: '镜湖' }, { c: [733, 520], r: 8 }, { c: [757, 536], r: 8 },
    { c: [392, 450], r: 15, name: '黑水泽' }, { c: [402, 470], r: 10 },
    { c: [700, 275], r: 16, name: '碧落湖' }, { c: [684, 268], r: 10 }, { c: [716, 284], r: 9 },
    { c: [128, 270], r: 12, name: '翠竹湖' }, { c: [138, 282], r: 7 },
  ],
};
const NEW_RIVERS: Partial<Record<MapId, { pts: P[]; w: number; name?: string }[]>> = {
  tiannan: [
    // 沧澜江：出云梦泽，东南奔流入海——南荒第一大江
    { pts: [[612, 470], [630, 500], [650, 540], [668, 578], [686, 606], [705, 638]], w: 3.4, name: '沧澜江' },
    // 白龙江：自北面大河分出，南注云梦泽
    { pts: [[574, 342], [584, 372], [592, 400], [598, 424]], w: 1.5, name: '白龙江' },
    // 碧落河：出碧落湖，东流入海
    { pts: [[716, 286], [760, 292], [810, 287], [860, 296], [922, 302]], w: 1.7, name: '碧落河' },
    // 翠竹溪：出翠竹湖，西流入海
    { pts: [[120, 272], [96, 262], [72, 258], [50, 250]], w: 1.1 },
  ],
};
const LAKE_ISLE_DATA: Partial<Record<MapId, { c: P; r: number }[]>> = {
  tiannan: [{ c: [592, 447], r: 4.2 }, { c: [745, 527], r: 2.2 }, { c: [698, 274], r: 2.4 }],
};
// 南荒放大：直接用南荒新图坐标写的这几张表跟着乘倍数（见 TN_K）
{
  const k = TN_K, I = ISLES.tiannan;
  for (const e of I.extra) { e.x0 *= k; e.y0 *= k; e.x1 *= k; e.y1 *= k; e.r0 *= k; e.r1 *= k; e.n = Math.round(e.n * k); }
  for (const l of NEW_LAKES.tiannan ?? []) { l.c = [l.c[0] * k, l.c[1] * k]; l.r *= k; }
  for (const r of NEW_RIVERS.tiannan ?? []) r.pts = r.pts.map(([x, y]): P => [x * k, y * k]);
  for (const l of LAKE_ISLE_DATA.tiannan ?? []) { l.c = [l.c[0] * k, l.c[1] * k]; l.r *= k; }
}
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
  const S = SPEC[id];
  const x0 = S.ox - 3, y0 = S.oy - 3, x1 = S.ox + S.W / S.sx + 3, y1 = S.oy + S.H / S.sy + 3;   // legacy 窗口（略放宽，海岸线伸出图外）
  const T = (p: P): P => toMap(id, p[0], p[1]);
  const sk = Math.sqrt(S.sx * S.sy);
  const mainland = id === 'luanxing' ? [] : clipPoly(RAW_MAINLAND, x0, y0, x1, y1).map(T);
  const lakes = RAW_LAKES.filter((l) => l.c[0] > x0 && l.c[0] < x1 && l.c[1] > y0 && l.c[1] < y1).map((l) => ({ ...l, c: T(l.c), r: l.r * sk * 0.8 }));
  const ranges = id === 'luanxing' ? [] : RAW_RANGES.filter((r) => bboxHits(r.pts, x0, y0, x1, y1)).map((r) => ({ ...r, pts: r.pts.map(T), w: r.w * S.rangeK }));
  const rivers = (id === 'luanxing' ? [] : RAW_RIVERS.filter((r) => bboxHits(r.pts, x0, y0, x1, y1))).concat(EXTRA_RIVERS[id] ?? []).map((r) => ({ ...r, pts: r.pts.map(T), w: r.w * S.riverK }));
  const zone = (zs: { pts: P[]; v: number }[]) => zs.filter((z) => bboxHits(z.pts, x0, y0, x1, y1)).map((z) => ({ ...z, pts: z.pts.map(T) }));
  const ren = REGION_RENAME[id] ?? {};
  const regions = RAW_REGIONS.filter((r) => MAP_REGIONS[id].includes(r.id)).map((r) => ({ ...r, ...(ren[r.id] ?? {}), pts: r.pts.map(T), label: r.label ? T(r.label) : undefined, labelSize: (r.labelSize ?? 1) * 1.3 }));
  if (id === 'tiannan') { const m = regions.find((r) => r.id === 'mulan'); if (m) m.label = T([430, 300]); }
  const labels = MAP_LABELS[id].map((l) => ({ ...l, at: T(l.at) }));
  const locations: LocDef[] = RAW_LOCATIONS.filter((l) => (l.map ?? legacyMapOf(l.x, l.y)) === id).map((l) => {
    const [x, y] = T([l.x, l.y]);
    return { ...l, map: id, x, y, ox: l.x, oy: l.y, island: l.island ? Math.round(l.island * (id === 'luanxing' ? 1.6 : id === 'tiannan' ? 1.2 * TN_K : 1.2)) : undefined };
  });
  const I = ISLES[id];
  const M: MapData = { id, W: S.W, H: S.H, mainland, lakes, ranges, rivers, arid: zone(RAW_ARID), cold: zone(RAW_COLD), forest: zone(RAW_FOREST), regions, labels, locations, islandField: I.field ?? null, extraIslands: I.extra, islandK: I.rk };
  M.locations.push(...genMinor(M, seed, pre));
  addNewWater(M);
  M.locations.push(...genSatellites(M, seed, pre));
  M.locations.push(...genFrontier(M, seed, pre));
  // P10：占山的大宗门让出整座山——落在山体里的小地点挪到山外（只挪位置，id 不变）
  yieldGrandSectGround(M.locations, WORLD_SCALE, (x, y) => pointInPoly(x, y, M.mainland) && !M.lakes.some((l) => Math.hypot(l.c[0] - x, l.c[1] - y) < l.r + 3));
  // P10：走新布局的城占地大（国都两万多见方），落在城里的小地点挪到城外（id、名字不变），见 gfx/citySize.ts
  clearCityGrounds(M.locations, (x, y) => M.mainland.length > 2 && pointInPoly(x, y, M.mainland) && !M.lakes.some((l) => Math.hypot(x - l.c[0], y - l.c[1]) < l.r + 2),
    (l) => { const o = fromMap(M.id, l.x, l.y); (l as LocDef).ox = o[0]; (l as LocDef).oy = o[1]; });
  return M;
}
// 主要地点的默认危险度（按 legacy 坐标：北方与沧溟外海更凶）
for (const l of RAW_LOCATIONS) if (l.danger === undefined) l.danger = l.type === 'danger' ? (l.y < 260 || l.x > 900 ? 4 : 3) : l.type === 'secret' ? 3 : 0;

const MAPS: Record<MapId, MapData> = {
  tiannan: buildMap('tiannan', 31415, ''),
  luanxing: buildMap('luanxing', 27183, 'lx_'),
  dajin: buildMap('dajin', 16180, 'dj_'),
};
let M = MAPS[ACTIVE_MAP];

// ---------- 当前地图（各模块沿用旧的导出名；都是活的绑定，setActiveMap 时一起换） ----------
export let MACRO_W = M.W;
export let MACRO_H = M.H;
export let WORLD_W = MACRO_W * WORLD_SCALE;
export let WORLD_H = MACRO_H * WORLD_SCALE;
export let MAINLAND = M.mainland;
export let LAKES = M.lakes;
/** 第四十五步：湖心岛（在陆地掩码上补回的小块陆地） */
export let LAKE_ISLES: { c: P; r: number }[] = LAKE_ISLE_DATA[ACTIVE_MAP] ?? [];
export let RANGES = M.ranges;
export let RIVERS = M.rivers;
export let ARID_ZONES = M.arid;
export let COLD_ZONES = M.cold;
export let FOREST_ZONES = M.forest;
export let REGIONS = M.regions;
export let BIG_LABELS = M.labels;
export let ISLAND_FIELD = M.islandField;
export let EXTRA_ISLANDS = M.extraIslands;
export let ISLAND_K = M.islandK;
/** 当前地图上的地点（每张图各有自己的一个数组，数组本身不换：模组往里加的地点一直都在） */
export let LOCATIONS: LocDef[] = M.locations;
/**
 * 把当前地图换成另一张（不重新载入页面）。只换这里的数据；地形、地标、迷雾等由 Game.switchMap 接着重建。
 * 返回是否真的换了。
 */

// ---------- 别界的人烟：按种子造几座城、几个宗门，再照人界的办法撒村镇、洞府、巢穴、茶寮 ----------
const REALM_WORDS: Record<string, { a: string[]; b: string[]; sect: string[]; folk: string }> = {
  archipelago: { a: ['潮', '澜', '汐', '珊', '蜃', '沧', '碧', '鲸'], b: ['生', '音', '月', '舟', '屿', '门'], sect: ['听潮阁', '碧海宫', '蜃楼派', '沧溟宗', '鲸歌门'], folk: '靠海吃海，家家有船' },
  desert: { a: ['沙', '金', '砾', '炎', '驼', '朔'], b: ['泉', '丘', '关', '洲', '井', '垣'], sect: ['流沙殿', '金乌宗', '砂砾门', '大漠孤烟阁', '日轮宫'], folk: '围着泉眼筑城，水比灵石金贵' },
  frost: { a: ['霜', '雪', '凛', '冰', '寒', '玄'], b: ['原', '渊', '岭', '关', '川', '堡'], sect: ['玄冰宫', '雪岭剑派', '寒渊宗', '凛风阁', '冰魄门'], folk: '终年积雪，屋舍半埋在雪里' },
  spiritwood: { a: ['青', '翠', '苍', '灵', '藤', '桑'], b: ['梧', '林', '木', '荫', '叶', '萝'], sect: ['万木宗', '青藤谷', '灵植阁', '苍梧派', '百草门'], folk: '城在树上，路在藤间' },
  ember: { a: ['赤', '焰', '烬', '熔', '朱', '丹'], b: ['墟', '炉', '岩', '烽', '堡', '壑'], sect: ['熔火殿', '赤焰宗', '烬余门', '丹炉谷', '朱雀阁'], folk: '靠着地火炼器为生' },
  nether: { a: ['幽', '冥', '玄', '夜', '魂', '阴'], b: ['都', '川', '阙', '泉', '渡', '陵'], sect: ['幽冥宗', '夜魂殿', '玄阴门', '黄泉阁', '鬼哭岭'], folk: '白昼如暮，灯火长明' },
};
function genRealmHubs(M: MapData, kind: string, seed: number, pre: string, realm: string): LocDef[] {
  const Wd = REALM_WORDS[kind] ?? REALM_WORDS.spiritwood;
  let st = (Math.imul(seed, 2246822519) ^ 0x1b873593) >>> 0;
  const rnd = () => { st = (Math.imul(st, 1664525) + 1013904223) >>> 0; return st / 4294967296; };
  const out: LocDef[] = [], used = new Set<string>();
  const sea = M.mainland.length < 3;
  const onLand = (x: number, y: number) => !sea && pointInPoly(x, y, M.mainland);
  const inLake = (x: number, y: number) => M.lakes.some((l) => Math.hypot(x - l.c[0], y - l.c[1]) < l.r + 3);
  const place = (d: number, spread: number): [number, number] | null => {
    for (let t = 0; t < 400; t++) {
      const x = M.W * (0.5 + (rnd() - 0.5) * spread), y = M.H * (0.5 + (rnd() - 0.5) * spread);
      if (x < 14 || y < 14 || x > M.W - 14 || y > M.H - 14) continue;
      if (!sea && (!onLand(x, y) || inLake(x, y))) continue;
      if (out.some((l) => Math.hypot(l.x - x, l.y - y) < d)) continue;
      return [x, y];
    }
    return null;
  };
  const name = (suf: string) => { let n = ''; for (let k = 0; k < 40 && (!n || used.has(n) || n[1] === suf); k++) n = Wd.a[Math.floor(rnd() * Wd.a.length)] + Wd.b[Math.floor(rnd() * Wd.b.length)] + suf; used.add(n); return n; };
  const mk = (tag: string, l: Omit<LocDef, 'id' | 'map' | 'ox' | 'oy'>) => out.push({ ...l, id: pre + tag + out.length, map: M.id, ox: l.x, oy: l.y });
  const cap = place(0, 0.3);
  if (cap) mk('h', { hub: 'capital', name: name(sea ? '岛' : '都'), type: 'city', major: true, x: cap[0], y: cap[1], island: sea ? 13 : undefined, danger: 0, desc: `${realm}最大的城池，这一界的修士与凡人多半聚居于此——${Wd.folk}。` });
  for (let i = 0, n = sea ? 2 : 3 + Math.floor(rnd() * 3); i < n; i++) {
    const q = place(46, 0.82); if (!q) break;
    mk('h', { hub: 'city', name: name(sea ? '屿' : '城'), type: sea ? 'isle' : 'city', major: i === 0 || undefined, x: q[0], y: q[1], island: sea ? 9 : undefined, danger: 0, desc: `${realm}的一座${sea ? '大岛' : '城'}，${Wd.folk}。` });
  }
  const sects = shuffleWith(Wd.sect.slice(), rnd);   // 别界：同一界在每个环境里都得一样（见 shuffleWith）
  for (let i = 0, n = sea ? 2 : 2 + Math.floor(rnd() * 3); i < n; i++) {
    const q = place(34, 0.86); if (!q) break;
    mk('h', { hub: 'sect', name: sects[i % sects.length], type: sea ? 'isle' : 'sect', major: i === 0 || undefined, x: q[0], y: q[1], island: sea ? 8 : undefined, danger: 0, desc: i === 0 ? `${realm}执牛耳的宗门，山门前的石阶据说有九千九百级。` : `${realm}的修仙宗门，不大见外人。` });
  }
  { const q = place(26, 0.6); if (q) mk('h', { hub: 'market', name: name('坊'), type: sea ? 'isle' : 'town', x: q[0], y: q[1], island: sea ? 7 : undefined, danger: 0, desc: `${realm}修士交换灵物的坊市。外界来客在这里最容易打听到消息。` }); }
  return out;
}
/** 别界的图造好、地点登记完之后通知一声（world/realmfolk.ts 借此把那一界的宗门登进名册） */
let onMapMade: ((id: MapId) => void) | null = null;
export function setOnMapMade(fn: typeof onMapMade) { onMapMade = fn; }
/** 别界的图从哪儿来：给了序号就按种子造出一张图的数据（由 zhujie.ts 登记） */
let mapSource: ((id: MapId) => { name: string; kind?: string; seed?: number; data: Omit<MapData, 'id' | 'regions' | 'labels' | 'locations'> } | null) | null = null;
export function setMapSource(fn: typeof mapSource) { mapSource = fn; }
/** 这张图的数据在不在；别界的图第一次用到时现造并登记：山河按种子造，再造几座城、几个宗门，照人界的办法撒村镇、洞府、巢穴 */
export function ensureMap(id: MapId): boolean {
  if (MAPS[id]) return true;
  const made = mapSource?.(id);
  if (!made) return false;
  const all: P[] = [[-40, -40], [made.data.W + 40, -40], [made.data.W + 40, made.data.H + 40], [-40, made.data.H + 40]];
  const short = made.name.split('·').pop() ?? made.name;
  const data: MapData = MAPS[id] = { id, ...made.data, regions: [{ id, name: short, parent: made.name, pts: all }], labels: [{ name: short, at: [made.data.W / 2, made.data.H * 0.46], size: 5 }], locations: [] };
  SPEC[id] = { ox: 0, oy: 0, sx: 1, sy: 1, W: made.data.W, H: made.data.H, rangeK: 1, riverK: 1 };   // 别界的图没有旧版坐标：按原样对应
  MAP_NAME[id] = made.name; MAP_EXITS[id] = []; EDGE_BLOCK_TEXT[id] = '前方已是这方天地的尽头——想出去，只有往天上飞。';
  ISLES[id] = { extra: [], rk: 1 };
  try {
    const seed = (made.seed ?? 1) >>> 0, pre = id.replace('realm-', 'r') + '_';
    data.locations.push(...genRealmHubs(data, made.kind ?? '', seed, pre, short));
    data.locations.push(...genMinor(data, seed ^ 0x9e3779b9, pre));
    data.locations.push(...genSatellites(data, seed, pre));
    data.locations.push(...genFrontier(data, seed, pre));
    // P10：别界的城也按样貌（炎墟、幽冥……）排；落在城里的小地点挪到城外
    setRealmKind(id, made.kind ?? '');
    clearCityGrounds(data.locations, (x, y) => (data.mainland.length < 3 || pointInPoly(x, y, data.mainland)) && !data.lakes.some((l) => Math.hypot(x - l.c[0], y - l.c[1]) < l.r + 2) && x > 14 && y > 14 && x < data.W - 14 && y < data.H - 14,
      (l) => { (l as LocDef).ox = l.x; (l as LocDef).oy = l.y; });
    for (const l of data.locations) { if (l.danger === undefined) l.danger = l.type === 'danger' ? 3 : l.type === 'secret' ? 3 : 0; if (!LOC_BY_ID.has(l.id)) { ALL_LOCATIONS.push(l); LOC_BY_ID.set(l.id, l); } }
  } catch (e) { console.warn('[别界] 造地点出错，这一界只有山河', e); data.locations.length = 0; }
  try { onMapMade?.(id); } catch (e) { console.warn('[别界] 登记宗门出错', e); }
  return true;
}
export function setActiveMap(id: MapId): boolean {
  if (id === ACTIVE_MAP || !ensureMap(id)) return false;
  ACTIVE_MAP = id; M = MAPS[id];
  MACRO_W = M.W; MACRO_H = M.H; WORLD_W = MACRO_W * WORLD_SCALE; WORLD_H = MACRO_H * WORLD_SCALE;
  MAINLAND = M.mainland; LAKES = M.lakes; LAKE_ISLES = LAKE_ISLE_DATA[id] ?? [];
  RANGES = M.ranges; RIVERS = M.rivers; ARID_ZONES = M.arid; COLD_ZONES = M.cold; FOREST_ZONES = M.forest;
  REGIONS = M.regions; BIG_LABELS = M.labels; ISLAND_FIELD = M.islandField; EXTRA_ISLANDS = M.extraIslands; ISLAND_K = M.islandK;
  LOCATIONS = M.locations;
  MAP_TINT = M.tint ?? null;
  zoneCache = null;
  return true;
}
/** 当前地图的色调（没有就是 null） */
export let MAP_TINT: MapTint | null = null;
/** 三张图的全部地点（用于名称查询、跨图 NPC 与传闻） */
export const ALL_LOCATIONS: LocDef[] = MAP_IDS.flatMap((m) => MAPS[m].locations);
export const LOC_BY_ID = new Map(ALL_LOCATIONS.map((l) => [l.id, l] as const));
/** 第三十步：地表地域底色——魔道宗门周边朱砂赤土（t=1），凶地 / 镇魔古山的灰紫阴土（t=2）。半径以原始图单位给，按本图缩放 */
const ZONE_DEF: [string, number, number][] = [
  ['guiling', 1, 30], ['hehuan', 1, 28], ['yuling', 1, 30], ['qianhuan', 1, 28], ['tiansha', 1, 30], ['yinluo', 1, 32],
  ['tianmo', 1, 26], ['jiyin', 1, 13],
  ['moyan', 1, 28], ['xuesha', 1, 28], ['motuo', 1, 24], ['dusheng', 1, 22],
  ['zhuimo', 2, 26], ['yinyang', 2, 16], ['kunwu', 2, 12],
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
export function locsOf(map: MapId): LocDef[] { return MAPS[map]?.locations ?? []; }
export function mapSize(map: MapId) { ensureMap(map); return { W: MAPS[map].W, H: MAPS[map].H }; }
export function mapMainland(map: MapId) { ensureMap(map); return MAPS[map].mainland; }
/** 绝域（world/jueyuField.ts）算离岸距离要用的那几样：大陆、湖、地点（含有半径的岛）、群岛与外海小岛的撒点范围 */
export function mapShoreData(map: MapId) {
  ensureMap(map); const D = MAPS[map];
  return { W: D.W, H: D.H, mainland: D.mainland, lakes: D.lakes, locations: D.locations, islandField: D.islandField, extraIslands: D.extraIslands, islandK: D.islandK };
}
/** 这张图的山脉（折线、宽度、高度，宏观单位）：从天外看这一界时按它做山体的起伏 */
export function mapRanges(map: MapId) { ensureMap(map); return MAPS[map].ranges; }
/** 地名（不在本图时冠以地图名，如“沧溟海·归墟殿”） */
export function locLabel(id: string | undefined | null): string { const l = id ? LOC_BY_ID.get(id) : undefined; return l ? (l.map !== ACTIVE_MAP ? MAP_NAME[l.map] + '·' : '') + l.name : ''; }
