// 收官 B4：绝域铺到别界——六种样貌的险地怎么配，以及「按界的种子现配一份」。
//
// 用户原话：无边海这套「弄好可以铺开程序化到不同的很多世界」。规则（world/jueyu.ts）不变，变的是配置：
//   · 介质：沧海是海（黑水狂涛，比无边海更凶）；瀚漠是流沙（陷进去＝落水，沙暴＝飓风，沙下巨虫的黑影）；
//     寒渊是冰海（浮冰可落脚、冰面会裂、极寒掉血）；炎墟是熔岩海（落进去持续烧、火山弹有落点预警、热浪上升气流把人托高）；
//     幽冥是冥河（视野极小、引魂灯、鬼物从雾里拉人）；灵木是瘴泽老林（毒瘴按浓度掉血、巨藤缠人、林窗是安全点）。
//   · 三种天象各自换皮（名字、颜色、特效的样子、挨上时的话），频度按界的种子在样貌的底子上浮动三成。
//   · 怪物表：借无边海那五种海兽的行为（凶鱼群、带触须的大家伙、巨蛟、雾中的鬼、天上的鳐），
//     名字、掉落换掉，贴图按样貌调色（不做新贴图；HD 场景乘 tint，二维回退走 beastTex 的 fx）。
//   · 分带宽度：按这一界大陆到图边那一圈最窄处有多宽摆（各界大小不同），再按种子浮动一成多。
// 同一界每次去都一样：所有「随机」都是界的种子过 hashU，不取 Math.random。
import { hashU } from '../core/rng';
import { WUBIAN, SEA_MEDIUM, SEA_WEATHER, type Curve, type ZoneBand, type ZoneProfile, type MediumKind, type BeastKind, type BeastSkin, type Medium, type WeatherSkin } from './jueyuProfile';
import type { RGB } from '../gl/fx';

/** 诸界的样貌 → 介质 */
export const KIND_MEDIUM: Record<string, MediumKind> = { archipelago: 'sea', desert: 'sand', frost: 'ice', ember: 'lava', nether: 'ming', spiritwood: 'miasma' };
/** 试玩入口的 kind= 用的名字 → 介质 */
export const MEDIUM_ALIAS: Record<string, MediumKind> = { sea: 'sea', sand: 'sand', ice: 'ice', lava: 'lava', ming: 'ming', miasma: 'miasma' };

interface Look {
  medium: Medium; weather: WeatherSkin;
  /** 四带的名字与第一次进去时的话 */
  bands: [string, string, string, string]; hints: [string, string, string, string];
  text: ZoneProfile['text'];
  /** 灵力流失按境界的倍率、落进去以后的参数 */
  drainK: number; swim: ZoneProfile['swim'];
  /** 视野在核心处收到多少；天象频度的底子 */
  view: number; freq: { storm: number; ghost: number; rift: number };
  beasts: Record<BeastKind, Omit<BeastSkin, 'drop' | 'rare'>> | null;
  mix: Record<BeastKind, number>;
  /** 介质的「气」在近岸、断层、核心的浓度 */
  haze: [number, number, number];
  /** 掉落：常见的、稀有的（data/seabeasts.ts 的 mat_jy_*） */
  drops: [string, string];
}
const B = (def: string, name: string, tint: RGB, glow: RGB, glowK: number, breach: string) => ({ def, name, tint, glow, glowK, breach });

export const LOOKS: Record<MediumKind, Look> = {
  // 沧海：接近无边海，但更凶——黑水更黑、飓风更多、霸主更常见、流失更快
  sea: {
    medium: { ...SEA_MEDIUM, palette: { mid: [0.05, 0.13, 0.16], deep: [0.012, 0.02, 0.034], glow: [0.55, 0.2, 0.85], foam: [0.84, 0.9, 0.92] }, qiyu: false },
    weather: { ...SEA_WEATHER, storm: { name: '黑水暴' } },
    bands: ['近海', '黑潮带', '怒涛核心', '界壁罡风'],
    hints: ['这一界没有大陆，只有星罗棋布的岛。岛外的海越往外越黑。', '入黑潮带：海色黑得发亮，浪头一个比一个高——灵力回复减半，罗盘乱转。', '入怒涛核心：黑水狂涛，比人界的无边海还凶。灵力每息都在流失，遁空梭失灵。', '前方是这一界的界壁：罡风贴着海面横扫，再往外只会被吹回来。'],
    text: { ...WUBIAN.text, fall: '灵力枯竭，遁光溃散——你一头栽进了黑水里！' },
    drainK: 1.15, swim: { drainK: 0.4, takeoff: 0.12, speed: 0.33 }, view: 0.36, freq: { storm: 1.35, ghost: 0.9, rift: 1.1 },
    beasts: null, mix: { guichi: 1, mochu: 1.1, liehai: 1.6, chuanling: 1, leiyao: 1.3 }, haze: [0, 0.1, 0.25], drops: ['mat_sb_guichi', 'mat_sb_jiaolin'],
  },
  // 瀚漠：「水」换成流沙——陷进去＝落水；沙暴＝飓风；沙下巨虫的黑影
  sand: {
    medium: { kind: 'sand', name: '流沙', palette: { mid: [0.6, 0.45, 0.27], deep: [0.38, 0.26, 0.14], glow: [1.0, 0.72, 0.3], foam: [0.9, 0.78, 0.55] },
      look: { wave: 1, emit: 0, flow: 0.6 }, burn: 0, chill: 0, toxic: 0, boat: 'any', boatWord: '沙舟', boatNo: '', dive: false, qiyu: false,
      floes: 0, thermal: 0, lamps: 0, glades: 0, rain: { kind: 'sand', c: [0.86, 0.7, 0.45] } },
    weather: {
      storm: { name: '沙暴' },
      strike: { name: '沙柱', fx: 'geyser', c: [1, 0.75, 0.4], hit: '脚下一道沙柱冲天而起，把你掀了个跟头！' },
      ghost: { name: '蜃气', mist: [0.86, 0.76, 0.58], ink: [0.42, 0.33, 0.2] },
      rift: { name: '地陷', c: [1, 0.62, 0.22], deep: [0.25, 0.12, 0.04], hit: '沙海塌陷，裂开的沙涡把你卷了进去！' },
    },
    bands: ['沙缘', '流沙带', '沙海腹地', '界壁风墙'],
    hints: ['大陆尽头是一望无际的沙海——沙子是活的，会流。', '入流沙带：沙面在脚下缓缓流动，热浪扭曲了远处的景物——灵力回复减半，罗盘乱转。', '入沙海腹地：沙涛翻滚，沙下有巨物在游。灵力每息流失，遁空梭失灵——力竭落下就会陷进流沙。', '前方是界壁的风墙：沙暴一阵猛过一阵，再往外只会被吹回来。'],
    text: { fall: '灵力枯竭，遁光一散——你一头栽进了流沙里！', swim: '陷沙中', noTakeoff: '灵力不足一成，拔不出流沙。服一枚回气的丹药，或者别乱动、慢慢缓过来。', dunkong: '沙海里的空间被热浪搅乱，遁空梭的阵纹乱作一团，催动不得！', drain: '灵力流失', regen: '灵力回复减半', lock: '神识受扰', abyss: '风墙' },
    drainK: 1, swim: { drainK: 0.45, takeoff: 0.12, speed: 0.24 }, view: 0.45, freq: { storm: 1.25, ghost: 0.8, rift: 1.2 },
    beasts: {
      guichi: B('jy_sand_yu', '沙鳞鲨', [1.3, 1.05, 0.68], [1, 0.75, 0.35], 0, '沙面炸开——一群沙鳞鲨从沙底跃出，鳞片沙沙作响！'),
      mochu: B('jy_sand_mo', '流沙魔母', [1.25, 0.95, 0.62], [1, 0.7, 0.3], 0.1, '沙海鼓起一座沙丘，丘顶裂开——流沙魔母探出了头，四周的沙面一条条隆起！'),
      liehai: B('jy_sand_chong', '噬沙巨虫', [1.35, 1.0, 0.6], [1, 0.6, 0.25], 0.15, '沙海轰然塌陷，一条节节分明的巨虫破沙而出——噬沙巨虫！'),
      chuanling: B('jy_sand_ling', '蜃影', [1.3, 1.15, 0.8], [1, 0.85, 0.5], 0.5, ''),
      leiyao: B('jy_sand_yao', '风沙鹞', [1.25, 1.0, 0.7], [1, 0.8, 0.45], 0.2, ''),
    },
    mix: { guichi: 1, mochu: 0.8, liehai: 1.5, chuanling: 0.7, leiyao: 1 }, haze: [0.05, 0.25, 0.4], drops: ['mat_jy_sand_1', 'mat_jy_sand_2'],
  },
  // 寒渊：冰海与暴雪冰裂——浮冰可落脚、冰面会裂、极寒掉血
  ice: {
    medium: { kind: 'ice', name: '冰海', palette: { mid: [0.08, 0.17, 0.26], deep: [0.02, 0.05, 0.09], glow: [0.55, 0.88, 1.0], foam: [0.86, 0.93, 0.98] },
      look: { wave: 2, emit: 0, flow: 0.5 }, burn: 0, chill: 0.032, toxic: 0, boat: 'none', boatWord: '灵舟', boatNo: '冰海里处处浮冰，灵舟一撞就裂——行不得舟。', dive: false, qiyu: false,
      floes: 1, thermal: 0, lamps: 0, glades: 0, rain: { kind: 'snow', c: [0.95, 0.97, 1] } },
    weather: {
      storm: { name: '暴雪' },
      strike: { name: '冰锥', fx: 'icicle', c: [0.75, 0.92, 1], hit: '一根冰锥从天而降，正砸在身上！' },
      ghost: { name: '冰雾', mist: [0.86, 0.92, 0.96], ink: [0.55, 0.62, 0.7] },
      rift: { name: '冰裂', c: [0.5, 0.9, 1], deep: [0.03, 0.1, 0.18], hit: '冰面轰然裂开，你掉进了刺骨的冰水里！' },
    },
    bands: ['冰缘', '浮冰带', '冰海深处', '界壁寒罡'],
    hints: ['大陆外是封冻的海：近岸冰层厚实，越往外冰越碎。', '入浮冰带：冰面碎成一块块浮冰，冰缝里是墨蓝的冰水——寒气透骨，灵力回复减半，罗盘乱转。', '入冰海深处：浮冰稀疏，寒气一刻不停地往骨头里钻（气血慢慢掉）。灵力每息流失、遁空梭失灵——落下来最好落在冰上。', '前方是界壁的寒罡：暴雪横着刮，再往外只会被吹回来。'],
    text: { fall: '灵力枯竭，遁光一散——你一头栽进了冰水里！', swim: '冰水中', noTakeoff: '灵力不足一成，在冰水里提不起遁光。爬上浮冰，或者服一枚回气的丹药。', dunkong: '极寒冻住了遁空梭的阵纹，催动不得！', drain: '灵力流失', regen: '灵力回复减半', lock: '神识受扰', abyss: '寒罡' },
    drainK: 0.85, swim: { drainK: 0.5, takeoff: 0.12, speed: 0.3 }, view: 0.42, freq: { storm: 1.15, ghost: 1, rift: 1.4 },
    beasts: {
      guichi: B('jy_ice_yu', '冰鳞鱼', [0.78, 0.95, 1.3], [0.6, 0.9, 1], 0.1, '冰缝里的水炸开——一群冰鳞鱼跃出水面，鳞片像碎冰一样闪！'),
      mochu: B('jy_ice_mo', '玄冰海魔', [0.75, 0.92, 1.3], [0.6, 0.85, 1], 0.2, '一块浮冰被顶翻，冰下浮起一颗青白的巨首——玄冰海魔！'),
      liehai: B('jy_ice_chi', '寒螭', [0.9, 1.0, 1.35], [0.65, 0.9, 1], 0.3, '冰层炸开一道长缝，一条霜白的寒螭破冰而出！'),
      chuanling: B('jy_ice_po', '冰魄', [0.7, 0.9, 1.4], [0.55, 0.85, 1], 0.6, ''),
      leiyao: B('jy_ice_yao', '霜翼鳐', [0.85, 0.95, 1.3], [0.7, 0.9, 1], 0.25, ''),
    },
    mix: { guichi: 1, mochu: 1, liehai: 1, chuanling: 1, leiyao: 0.8 }, haze: [0.1, 0.3, 0.6], drops: ['mat_jy_ice_1', 'mat_jy_ice_2'],
  },
  // 炎墟：熔岩海与火雨——落进去持续烧、火山弹落点预警、热浪上升气流能把人托高
  lava: {
    medium: { kind: 'lava', name: '熔岩', palette: { mid: [0.95, 0.34, 0.06], deep: [0.11, 0.035, 0.025], glow: [1.0, 0.55, 0.12], foam: [1.0, 0.82, 0.38] },
      look: { wave: 3, emit: 1, flow: 0.35 }, burn: 0.1, chill: 0, toxic: 0, boat: 'high', boatWord: '灵舟', boatNo: '熔岩一沾船底就着了——只有龟甲宝船这样的好船经得住。', dive: false, qiyu: false,
      floes: 0, thermal: 0.16, lamps: 0, glades: 0, rain: { kind: 'ember', c: [1, 0.55, 0.15] } },
    weather: {
      storm: { name: '火雨' },
      strike: { name: '火山弹', fx: 'bomb', c: [1, 0.5, 0.15], hit: '一颗火山弹砸在身边，烈焰把你掀翻！' },
      ghost: { name: '灰烟', mist: [0.2, 0.15, 0.13], ink: [0.08, 0.05, 0.04] },
      rift: { name: '熔岩裂', c: [1, 0.45, 0.08], deep: [0.3, 0.05, 0.02], hit: '岩壳崩裂，喷出的熔岩把你燎了个正着！' },
    },
    bands: ['焦岸', '熔流带', '熔岩海', '界壁火墙'],
    hints: ['大陆外是一整片熔岩海——落下去不是泅水，是被活活烧。', '入熔流带：岩壳下的熔岩缓缓翻涌，热气蒸得人发昏——灵力回复减半，罗盘乱转。找翻涌发亮的热浪口，上升气流能把你托高。', '入熔岩海：天上下着火雨，火山弹随时落下（地上亮起红圈就快躲）。灵力每息流失、遁空梭失灵——千万别力竭落下。', '前方是界壁的火墙：热浪一阵猛过一阵，再往外只会被推回来。'],
    text: { fall: '灵力枯竭，遁光一散——你一头栽进了熔岩里！', swim: '熔岩里', noTakeoff: '灵力不足一成，在熔岩里提不起遁光——服丹药，快！', dunkong: '热浪扭曲了空间，遁空梭的阵纹乱作一团，催动不得！', drain: '灵力流失', regen: '灵力回复减半', lock: '神识受扰', abyss: '火墙' },
    drainK: 0.9, swim: { drainK: 0.5, takeoff: 0.1, speed: 0.3 }, view: 0.5, freq: { storm: 1.4, ghost: 0.6, rift: 1.3 },
    beasts: {
      guichi: B('jy_lava_yu', '熔岩鱼', [1.6, 0.75, 0.42], [1, 0.45, 0.1], 0.55, '岩浆炸开——一群通体赤红的熔岩鱼跃了出来，溅起一片火星！'),
      mochu: B('jy_lava_mo', '炎魔', [1.5, 0.62, 0.38], [1, 0.4, 0.1], 0.5, '熔岩海鼓起一个大泡，泡里浮起一颗焦黑透红的巨首——炎魔！'),
      liehai: B('jy_lava_jiao', '熔岩火蛟', [1.55, 0.7, 0.4], [1, 0.5, 0.12], 0.7, '熔岩海轰然裂开，一条浑身流火的巨蛟破浪而出——熔岩火蛟！'),
      chuanling: B('jy_lava_ling', '火灵', [1.6, 0.8, 0.45], [1, 0.55, 0.2], 0.8, ''),
      leiyao: B('jy_lava_yao', '焰翼鳐', [1.5, 0.7, 0.45], [1, 0.5, 0.15], 0.6, ''),
    },
    mix: { guichi: 1.2, mochu: 0.9, liehai: 1.1, chuanling: 0.6, leiyao: 1.3 }, haze: [0.1, 0.35, 0.55], drops: ['mat_jy_lava_1', 'mat_jy_lava_2'],
  },
  // 幽冥：冥河鬼雾——视野极小、引魂灯（安全点）、鬼物从雾里拉人
  ming: {
    medium: { kind: 'ming', name: '冥河', palette: { mid: [0.04, 0.09, 0.08], deep: [0.008, 0.02, 0.025], glow: [0.35, 1.0, 0.7], foam: [0.55, 0.72, 0.66] },
      look: { wave: 4, emit: 0.5, flow: 0.4 }, burn: 0, chill: 0, toxic: 0, boat: 'any', boatWord: '冥舟', boatNo: '', dive: false, qiyu: false,
      floes: 0, thermal: 0, lamps: 0.3, glades: 0, rain: { kind: 'wisp', c: [0.55, 1, 0.78] } },
    weather: {
      storm: { name: '阴风' },
      strike: { name: '勾魂手', fx: 'hand', c: [0.45, 1, 0.7], hit: '一只惨白的手从冥河里伸出来，一把攥住了你往下拖！' },
      ghost: { name: '冥雾', mist: [0.36, 0.44, 0.42], ink: [0.05, 0.09, 0.08] },
      rift: { name: '冥渊裂', c: [0.4, 1, 0.7], deep: [0.02, 0.12, 0.08], hit: '冥渊裂开，阴气透体而过！' },
    },
    bands: ['冥岸', '雾川', '冥河深处', '界壁阴风'],
    hints: ['大陆外是一整条无边的冥河。河上的雾是活的。', '入雾川：冥雾四合，神识只照得到身边一小圈——灵力回复减半，罗盘乱转。河上漂着的引魂灯照得开雾，灯下能歇脚。', '入冥河深处：雾里有东西会伸手拉人（水面泛起绿圈就快躲）。灵力每息流失、遁空梭失灵——认准引魂灯走。', '前方是界壁的阴风：吹得魂魄都要离体，再往外只会被吹回来。'],
    text: { fall: '灵力枯竭，遁光一散——你一头栽进了冥河里！', swim: '冥河中', noTakeoff: '灵力不足一成，冥河的水拽着你的魂，提不起遁光。服丹药，或游到引魂灯下缓一缓。', dunkong: '阴气搅乱了空间，遁空梭的阵纹乱作一团，催动不得！', drain: '灵力流失', regen: '灵力回复减半', lock: '神识受扰', abyss: '阴风' },
    drainK: 1.05, swim: { drainK: 0.4, takeoff: 0.12, speed: 0.33 }, view: 0.24, freq: { storm: 0.8, ghost: 1.8, rift: 1 },
    beasts: {
      guichi: B('jy_ming_yu', '冥河怨鱼', [0.7, 1.0, 0.9], [0.4, 1, 0.75], 0.35, '冥河翻起一片惨绿的水花——一群冥河怨鱼跃了出来，眼里冒着磷火！'),
      mochu: B('jy_ming_mo', '冥河魇母', [0.65, 0.95, 0.88], [0.35, 1, 0.7], 0.4, '冥河上浮起一颗青灰的巨首，雾里伸出一条条手臂——冥河魇母！'),
      liehai: B('jy_ming_jiao', '骨蛟', [1.1, 1.15, 1.05], [0.5, 1, 0.8], 0.45, '冥河哗地裂开，一条只剩白骨的巨蛟破水而出——骨蛟！'),
      chuanling: B('jy_ming_gui', '引渡鬼', [0.75, 1.05, 0.95], [0.4, 1, 0.75], 0.6, ''),
      leiyao: B('jy_ming_ya', '冥鸦', [0.6, 0.85, 0.8], [0.4, 1, 0.75], 0.3, ''),
    },
    mix: { guichi: 1, mochu: 1.1, liehai: 0.9, chuanling: 2.2, leiyao: 0.7 }, haze: [0.15, 0.55, 0.8], drops: ['mat_jy_ming_1', 'mat_jy_ming_2'],
  },
  // 灵木：瘴林——毒瘴按浓度掉血、巨藤像触须一样缠人、瘴气散开的林窗是安全点
  miasma: {
    medium: { kind: 'miasma', name: '瘴泽', palette: { mid: [0.13, 0.18, 0.07], deep: [0.045, 0.07, 0.03], glow: [0.72, 1.0, 0.3], foam: [0.42, 0.5, 0.22] },
      look: { wave: 5, emit: 0.2, flow: 0.3 }, burn: 0, chill: 0, toxic: 0.03, boat: 'any', boatWord: '灵舟', boatNo: '', dive: false, qiyu: false,
      floes: 0, thermal: 0, lamps: 0, glades: 0.26, rain: { kind: 'spore', c: [0.75, 0.95, 0.35] } },
    weather: {
      storm: { name: '瘴风' },
      strike: { name: '毒藤', fx: 'vine', c: [0.6, 1, 0.3], hit: '泽底甩出一条带刺的毒藤，狠狠抽在身上！' },
      ghost: { name: '毒瘴', mist: [0.44, 0.52, 0.22], ink: [0.08, 0.12, 0.05] },
      rift: { name: '地缝毒泉', c: [0.65, 1, 0.25], deep: [0.1, 0.18, 0.03], hit: '泽底裂开一道毒泉，喷了你一身！' },
    },
    bands: ['林缘', '瘴林', '瘴海深处', '界壁毒罡'],
    hints: ['大陆外是一整片泡在瘴泽里的老林：树冠下全是毒瘴。', '入瘴林：毒瘴一缕缕往鼻子里钻，越浓掉血越快——灵力回复减半，罗盘乱转。瘴气散开、透下天光的林窗里能喘口气。', '入瘴海深处：泽底有巨藤，会像触须一样缠人。灵力每息流失、遁空梭失灵——认准林窗走。', '前方是界壁的毒罡：瘴气凝成了墙，再往外只会被顶回来。'],
    text: { fall: '灵力枯竭，遁光一散——你一头栽进了瘴泽里！', swim: '瘴泽中', noTakeoff: '灵力不足一成，泥沼拽着腿，提不起遁光。服丹药，或者挪到林窗里缓一缓。', dunkong: '瘴气搅乱了空间，遁空梭的阵纹乱作一团，催动不得！', drain: '灵力流失', regen: '灵力回复减半', lock: '神识受扰', abyss: '毒罡' },
    drainK: 0.8, swim: { drainK: 0.4, takeoff: 0.12, speed: 0.38 }, view: 0.42, freq: { storm: 0.8, ghost: 1.6, rift: 0.9 },
    beasts: {
      guichi: B('jy_zhang_yu', '腐泽毒鱼', [0.85, 1.15, 0.62], [0.7, 1, 0.3], 0.15, '泥沼里冒起一串毒泡——一群腐泽毒鱼跃了出来！'),
      mochu: B('jy_zhang_teng', '千藤母', [0.62, 1.05, 0.45], [0.6, 1, 0.25], 0.2, '泽底的淤泥翻了起来，一株巨大的藤母探出头，四周的泥里一条条巨藤拱了出来！'),
      liehai: B('jy_zhang_jiao', '瘴蛟', [0.8, 1.1, 0.55], [0.7, 1, 0.3], 0.25, '瘴泽轰然炸开，一条披着青苔的巨蛟破泥而出——瘴蛟！'),
      chuanling: B('jy_zhang_mei', '瘴魅', [0.8, 1.15, 0.6], [0.7, 1, 0.35], 0.5, ''),
      leiyao: B('jy_zhang_yao', '毒翅鳐', [0.8, 1.1, 0.55], [0.7, 1, 0.3], 0.2, ''),
    },
    mix: { guichi: 0.9, mochu: 1.8, liehai: 0.8, chuanling: 1.2, leiyao: 0.8 }, haze: [0.15, 0.5, 0.85], drops: ['mat_jy_zhang_1', 'mat_jy_zhang_2'],
  },
};

/** 按无边海的锚点（断层 12000、核心 34000、绝域 45000）把一条曲线挪到新的分带上（逐段线性） */
function remap(c: Curve, f1: number, f2: number, f3: number): Curve {
  const A = [0, 12000, 34000, 45000], Bk = [0, f1, f2, f3];
  const m = (d: number) => {
    for (let i = 1; i < A.length; i++) if (d <= A[i]) return Bk[i - 1] + (d - A[i - 1]) / (A[i] - A[i - 1]) * (Bk[i] - Bk[i - 1]);
    return f3 + (d - 45000) * (f3 - f2) / 11000;
  };
  // 挪过以后关键点仍须严格递增（曲线查表要求）
  const at: number[] = [];
  for (const d of c.at) { const x = Math.round(m(d)); at.push(at.length && x <= at[at.length - 1] ? at[at.length - 1] + 1 : x); }
  return { at, v: c.v.slice() };
}

/**
 * 一界的险地配置：样貌定介质，界的种子定细节（同一界每次去都一样）。
 * ring：这一界大陆到图边那一圈最窄处有多宽（世界单位）——断层约在一成八、核心四成半、绝域（界壁罡风）七成八，各按种子浮动。
 */
export function realmProfile(kind: MediumKind, seed: number, ring: number, name: string): ZoneProfile {
  const L = LOOKS[kind], r = (k: number) => hashU(seed | 0, k, 0xb4);
  const j = (k: number, a: number) => 1 + (r(k) - 0.5) * 2 * a;   // 1 ± a
  const f1 = Math.round(ring * 0.18 * j(1, 0.15)), f2 = Math.round(ring * 0.45 * j(2, 0.1)), f3 = Math.round(ring * 0.78 * j(3, 0.05));
  const W = WUBIAN.curves;
  const rc = (c: Curve) => remap(c, f1, f2, f3);
  const curves: ZoneProfile['curves'] = {
    // 回复、流失、遁空梭不按比例挪：一进核心就该不回气、开始流失（按比例挪过来，核心头上那一截回复还剩两三成、几乎不流失）
    ceiling: rc(W.ceiling),
    regen: { at: [0, Math.round(f1 * 0.9), Math.round(f1 * 1.3), Math.round(f2 * 0.94), Math.round(f2 * 1.06)], v: [1, 1, 0.5, 0.5, 0] },
    drain: { at: [0, Math.round(f2 * 0.94), Math.round(f2 + (f3 - f2) * 0.3)], v: [0, 0, 1] },
    view: { ...rc(W.view), v: [1, 1, L.view] },
    dark: rc(W.dark), swell: { ...rc(W.swell), v: kind === 'sea' ? [0.18, 0.3, 0.75, 1] : [0.08, 0.14, 0.4, 0.6] },
    rift: rc(W.rift), spin: rc(W.spin), mapLock: rc(W.mapLock), dunkong: { at: [0, Math.round(f2 * 0.96), Math.round(f2 * 1.02)], v: [1, 1, 0] },
    storm: rc(W.storm), ghost: rc(W.ghost), riftRate: rc(W.riftRate),
    haze: { at: [0, Math.round(f1 * 0.6), f1, f2], v: [0, L.haze[0], L.haze[1], L.haze[2]] },
  };
  const freq = { storm: L.freq.storm * j(4, 0.3), ghost: L.freq.ghost * j(5, 0.3), rift: L.freq.rift * j(6, 0.3) };
  const mix = { ...L.mix }; (Object.keys(mix) as BeastKind[]).forEach((k, i) => { mix[k] *= j(10 + i, 0.35); });
  const beasts = L.beasts ? Object.fromEntries((Object.keys(L.beasts) as BeastKind[]).map((k) => [k, { ...L.beasts![k], drop: L.drops[0], rare: L.drops[1] }])) as Record<BeastKind, BeastSkin> : null;
  const bands: ZoneBand[] = [
    { id: 'near', name: L.bands[0], from: 0, hint: L.hints[0] }, { id: 'fog', name: L.bands[1], from: f1, hint: L.hints[1] },
    { id: 'core', name: L.bands[2], from: f2, hint: L.hints[2] }, { id: 'abyss', name: L.bands[3], from: f3, hint: L.hints[3] },
  ];
  return {
    id: `jy-${kind}-${seed >>> 0}`, name, medium: L.medium, weather: L.weather, beasts, mix, freq,
    bands, abyssFrom: f3, abyssWind: { scale: Math.max(2000, ring * 0.1), base: 1500, pow: 1.5 }, curves,
    drainByRealm: WUBIAN.drainByRealm.map((v) => v * L.drainK), swim: L.swim,
    riftTide: { ...WUBIAN.riftTide, chance: Math.min(0.9, WUBIAN.riftTide.chance * freq.rift) }, text: L.text,
  };
}

/** 本界里的小险地：地图、中心与范围（本图坐标）；分带按「离岸多远」（湖心最深） */
export interface LocalZone { id: string; map: string; x: number; y: number; R: number; profile: ZoneProfile }
/**
 * 南荒的腐骨瘴泽：火蟾沼、腐骨沼、毒蛟潭、白骨岗、尸鬼坟围着的那一大片湖（南荒东南，宏观坐标约 1190, 895）——
 * 本来就是一片死地，湖里没有城镇、不在主线的路上；湖面不能走，只有飞过去、乘船进去的人才会碰上。
 * 用小尺寸的灵木配置：没有绝域，流失只有一半出头，遁空梭照常能用（不挡赶路）。
 */
function localMiasma(): ZoneProfile {
  const P = realmProfile('miasma', 0x0f0d, 16000, '腐骨瘴泽');
  const f1 = 2200, f2 = 6000;
  const c = (v: number[]): Curve => ({ at: [0, f1, f2, f2 + 4000], v });
  return {
    ...P, id: 'jy-local-fugu', name: '腐骨瘴泽', local: true,
    bands: [
      { id: 'near', name: '泽边', from: 0, hint: '' },
      { id: 'fog', name: '腐骨瘴泽', from: f1, hint: '入腐骨瘴泽：湖上终年罩着一层毒瘴，越往湖心越浓（气血慢慢掉）——瘴气散开、透下天光的林窗里能喘口气。灵力回复打折。' },
      { id: 'core', name: '瘴泽湖心', from: f2, hint: '到了瘴泽湖心：瘴气浓得化不开，泥里有巨藤。灵力在一点点流失——别在这儿久留。' },
      { id: 'abyss', name: '—', from: 1e9, hint: '' },
    ],
    abyssFrom: 1e9,
    curves: {
      ...P.curves,
      ceiling: c([420, 420, 300, 260]), regen: c([1, 0.6, 0.5, 0.5]), drain: c([0, 0, 0.35, 0.6]), view: c([1, 0.85, 0.6, 0.55]),
      dark: c([0, 0.35, 0.7, 0.85]), swell: c([0.05, 0.1, 0.18, 0.2]), rift: c([0, 0, 0.2, 0.3]), spin: c([0, 0.2, 0.6, 0.7]), mapLock: c([0, 0, 0, 0]), dunkong: c([1, 1, 1, 1]),
      storm: c([0, 0, 0, 0]), ghost: c([0, 0.4, 1, 1]), riftRate: c([0, 0, 0.2, 0.3]), haze: c([0, 0.35, 0.7, 0.8]),
    },
    drainByRealm: P.drainByRealm.map((v) => v * 0.6), freq: { storm: 0, ghost: 1.4, rift: 0.6 },
    mix: { guichi: 1, mochu: 1.5, liehai: 0, chuanling: 0.6, leiyao: 0 },
  };
}
export const LOCAL_ZONES: LocalZone[] = [{ id: 'fugu', map: 'tiannan', x: 1190 * 300, y: 895 * 300, R: 30000, profile: localMiasma() }];
