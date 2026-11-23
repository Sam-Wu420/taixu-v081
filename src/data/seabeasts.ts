// 无边海的海兽（收官 B2）：数据。逻辑在 world/seabeast.ts，画法在 hd2d/seathings.ts，贴图登记在 gfx/beastTex.ts。
//
// 全部 lair: true、minDanger 99：不进普通刷怪池（spawnTick、rollBeast、秘境、事件、城镇那几处都按 lair 或 zone 排除），
// 所以加进 ENEMY_LIST 也不扰动已经固定了种子的刷怪序列。lair 会让血量 ×1.6、击杀修为 ×5、妖丹给两枚——
// 正合「深海里活下来的少数几头」的分量。称谓 title 取「海兽·…」，名牌上显示「五级海兽」而不是「妖王」。
// 掉落 drops 一律留空：掉什么由 seabeast.ts 用自己的随机序列另算（「掉落的随机数只在新分支里取」）。
import type { EnemyDef } from './enemies';
import type { ItemDef } from './items';

export const SEA_BEASTS: EnemyDef[] = [
  // 鬼齿凶鱼：成群贴着水面游，跃出水面扑咬，咬住了往下拖
  { id: 'sb_guichi', name: '鬼齿凶鱼', kind: 'beast', lv: [5, 6], lair: true, zone: 'sea', look: { body: 'fish', color: [70, 70, 96], belly: [190, 180, 200], size: 1.3, spikes: true, eye: 'rgba(200,255,250,1)' },
    minDanger: 99, maxDanger: -1, hp: 0.75, atk: 1.1, def: 0.8, speed: 300, melee: { range: 90, power: 1.3, cd: 1.2 }, pack: [3, 5], aggro: 900, title: '海兽·凶鱼', drops: [] },
  // 墨触海魔：头露出水面，四到六条触须先上
  { id: 'sb_mochu', name: '墨触海魔', kind: 'beast', lv: [7, 8], lair: true, zone: 'sea', look: { body: 'jelly', color: [60, 30, 80], accent: [170, 90, 230], size: 2.4, eye: 'rgba(255,210,90,1)' },
    minDanger: 99, maxDanger: -1, hp: 2.2, atk: 1.25, def: 1.3, speed: 60, melee: { range: 160, power: 1.4, cd: 2 }, aggro: 1200, title: '海兽·海魔', drops: [] },
  // 墨触海魔的触须：有血量、能锁定、能被斩断（子单位，跟着本体）
  { id: 'sb_mochu_xu', name: '墨触须', kind: 'beast', lv: [7, 8], lair: true, zone: 'sea', look: { body: 'snake', color: [70, 40, 90], belly: [200, 180, 210], size: 1.2 },
    minDanger: 99, maxDanger: -1, hp: 0.42, atk: 1.0, def: 0.9, speed: 0, aggro: 1200, title: '海兽·触须', drops: [] },
  // 裂海玄蛟：八阶霸主，元婴战力。血腥味引来的
  { id: 'sb_liehai', name: '裂海玄蛟', kind: 'beast', lv: [8, 8], lair: true, zone: 'sea', look: { body: 'jiao', color: [30, 40, 70], belly: [190, 200, 210], accent: [120, 170, 255], size: 2.8, spikes: true, eye: 'rgba(140,200,255,1)', glow: '120,170,255' },
    minDanger: 99, maxDanger: -1, hp: 2.6, atk: 1.55, def: 1.4, speed: 380, melee: { range: 200, power: 2, cd: 1.6 }, aggro: 1600, title: '海兽·霸主', drops: [] },
  // 雾中船灵：只在鬼雾里；灯不灭，打散了还会在雾的另一头聚起来
  { id: 'sb_chuanling', name: '雾中船灵', kind: 'ghost', lv: [6, 7], lair: true, zone: 'sea', evil: true, look: { body: 'ghost', color: [90, 140, 130], size: 1.5, eye: 'rgba(140,255,210,1)' },
    minDanger: 99, maxDanger: -1, hp: 0.9, atk: 1.15, def: 0.7, speed: 170, ranged: { fx: 'ghost', color: '120,255,200', range: 700, power: 0.9, cd: 3 }, aggro: 1000, title: '海兽·船灵', drops: [] },
  { id: 'sb_chuanling_deng', name: '船灵魂灯', kind: 'ghost', lv: [6, 7], lair: true, zone: 'sea', evil: true, look: { body: 'ghost', color: [120, 255, 200], size: 0.5 },
    minDanger: 99, maxDanger: -1, hp: 0.16, atk: 0.2, def: 0.5, speed: 0, aggro: 1000, title: '海兽·魂灯', drops: [] },
  // 雷鳐：跟着飓风出现，在雨带里盘旋，引雷俯冲
  { id: 'sb_leiyao', name: '雷鳐', kind: 'beast', lv: [6, 6], lair: true, zone: 'sea', flying: true, look: { body: 'bat', color: [40, 60, 110], belly: [170, 190, 230], size: 1.4, glow: '150,200,255' },
    minDanger: 99, maxDanger: -1, hp: 0.8, atk: 1.2, def: 0.8, speed: 340, melee: { range: 120, power: 1.3, cd: 2 }, aggro: 1200, title: '海兽·雷鳐', drops: [] },
];

/**
 * 海兽材料与鲸背上的东西。类别一律用 misc：坊市、事件、NPC 身家的物品池只取 herb / material / pill / artifact……，
 * misc 不在任何随机池里——加了这几样，固定种子的经济模拟和刷货序列一个都不变。
 */
export const SEA_ITEMS: ItemDef[] = [
  { id: 'mat_sb_guichi', name: '鬼齿', type: 'misc', tier: 3, price: 1600, desc: '鬼齿凶鱼的獠牙，森白带磷光，炼器师拿它开刃。', glyph: '齿', stack: true },
  { id: 'mat_sb_monang', name: '海魔墨囊', type: 'misc', tier: 3, price: 5200, desc: '墨触海魔的墨囊，墨汁遇水化雾、遮人神识，可制障眼的符墨。', glyph: '囊', stack: true },
  { id: 'mat_sb_chuxu', name: '墨触须段', type: 'misc', tier: 3, price: 2400, desc: '一截斩下的触须，吸盘还在微微收缩。韧如牛筋，是编法索的好料。', glyph: '须', stack: true },
  { id: 'mat_sb_jiaolin', name: '玄蛟逆鳞', type: 'misc', tier: 4, price: 26000, desc: '裂海玄蛟颈下的逆鳞，黑中透蓝，隐有雷纹。元婴修士炼本命法宝都求之不得。', glyph: '鳞', stack: true },
  { id: 'mat_sb_jiaojiao', name: '玄蛟断角', type: 'misc', tier: 4, price: 42000, desc: '裂海玄蛟的独角，含着一缕未散的雷意。', glyph: '角', stack: true },
  { id: 'mat_sb_hundeng', name: '船灵魂灯芯', type: 'misc', tier: 3, price: 6800, desc: '雾中船灵手里那盏灯的灯芯，熄了也冷冷发亮。鬼道修士视若珍宝。', glyph: '灯', stack: true },
  { id: 'mat_sb_leiyi', name: '雷鳐翼骨', type: 'misc', tier: 3, price: 3600, desc: '雷鳐的翼骨，握在手里指尖发麻，可炼雷属法器。', glyph: '骨', stack: true },
  { id: 'mat_sb_lingcao', name: '深海灵草', type: 'misc', tier: 3, price: 4500, desc: '寄生在覆海玄鲸背上的灵草，吸着鲸息长成，离了海水三日不枯。坊市里有价无市。', glyph: '草', stack: true },
  { id: 'mat_sb_jingxian', name: '鲸涎香', type: 'misc', tier: 4, price: 18000, desc: '覆海玄鲸背上偶尔结出的一块涎香，焚之可宁心神，是闭关的上品。', glyph: '香', stack: true },
];

// ================================================================ 收官 B3：灵舟、海渊、奇遇的数据
// 一律 misc：坊市、事件、NPC 身家、拍卖的随机物品池都不取 misc，所以加了这些，固定种子的经济模拟和刷货序列一个都不变。
// 灵舟低阶的在大城法器阁另行上架（world/town.ts 用自己的种子序列追加，不动原来的抽货），高阶的走海兽、遗迹首领、鬼市。

/** 一种灵舟：耐久（点）、船上灵力流失的倍率、航速、加速、转向（弧度 / 息）、护罩分担几成伤害、能不能潜（玄龟宝船）、画法 */
export interface BoatSpec {
  id: string; name: string; hp: number; drainK: number; speed: number; accel: number; turn: number; shield: number; dive: boolean;
  /** HD 场景里的贴图、立板高度（世界单位）、人站的甲板离水面多高、甲板在立板上偏前多少（船头朝左的原画里人站在哪） */
  tex: string; H: number; deck: number; deckX: number;
  /** 自己慢慢回复：每个游戏日回多少成 */
  heal: number;
}
export const BOATS: Record<string, BoatSpec> = {
  // 乌篷灵舟：筑基散修出海的标配。皮薄，触须缠上几息就散；灵力流失只剩四分之一
  lz_wupeng: { id: 'lz_wupeng', name: '乌篷灵舟', hp: 140, drainK: 0.25, speed: 560, accel: 300, turn: 1.6, shield: 0.12, dive: false, tex: 'lz_wupeng', H: 210, deck: 46, deckX: -40, heal: 0.03 },
  // 破浪灵舟：雕栏画舫，灵光护罩分担两成伤害，航速快
  lz_polang: { id: 'lz_polang', name: '破浪灵舟', hp: 300, drainK: 0.2, speed: 700, accel: 380, turn: 1.4, shield: 0.22, dive: false, tex: 'sb_lingzhou', H: 260, deck: 70, deckX: 10, heal: 0.04 },
  // 玄龟宝船：龟甲为舟，护罩能沉入海渊当避水罩用（人在船上下潜不受水压，改耗船的耐久）
  lz_xuangui: { id: 'lz_xuangui', name: '玄龟宝船', hp: 620, drainK: 0.15, speed: 640, accel: 340, turn: 1.15, shield: 0.38, dive: true, tex: 'lz_xuangui', H: 330, deck: 128, deckX: 30, heal: 0.05 },
};

/** 海渊里避水的东西：揣在袋里就有效（避水珠、定海珠）——数值是「避水」，和装备上的 waterward 相加 */
export const WARD_CHARMS: Record<string, number> = { hy_bishuizhu: 0.35, hy_dinghaizhu: 0.6 };

SEA_ITEMS.push(
  { id: 'lz_wupeng', name: '乌篷灵舟', type: 'misc', tier: 2, price: 4800, desc: '一叶黑篷小舟，船舷刻着避浪的符纹。祭出后可载人入海，船上灵力流失只剩四分之一，还能打坐回气。皮薄，经不起海兽缠斗。（快捷栏或储物袋里「祭出」，或按灵舟键）', glyph: '舟', stack: true },
  { id: 'lz_polang', name: '破浪灵舟', type: 'misc', tier: 3, price: 26000, desc: '雕栏画舫式的灵舟，船头悬一盏引魂灯。灵光护罩能替人挡下两成伤害，航速快，流失只剩两成。', glyph: '舟', stack: true },
  { id: 'lz_xuangui', name: '玄龟宝船', type: 'misc', tier: 5, price: 180000, desc: '以深海玄龟的整副背甲炼成的宝船。护罩极厚，灵力流失只剩一成半；龟甲避水，人在船上可随船沉入海渊而不受水压（改耗船的耐久）。', glyph: '舟', stack: true },
  { id: 'hy_bishuizhu', name: '避水珠', type: 'misc', tier: 4, price: 32000, desc: '海底古修遗下的一颗青珠，揣在怀里，海水自然分开三尺。入海渊时避水 +35%（与装备的避水相加）。', glyph: '珠', stack: true },
  { id: 'hy_dinghaizhu', name: '定海珠', type: 'misc', tier: 5, price: 150000, desc: '古魔镇守海眼的宝珠，深渊万丈之下也压不住它的光。揣在身上避水 +60%。', glyph: '珠', stack: true },
  { id: 'hy_bishuidan', name: '避水丹', type: 'misc', tier: 3, price: 2600, desc: '以海魔墨囊和深海灵草炼成的丹丸，服下后三刻（一百八十息）避水 +45%。在储物袋里「服用」。', glyph: '丹', stack: true },
  { id: 'hy_haitu', name: '海渊残图', type: 'misc', tier: 3, price: 0, desc: '鬼市里换来的一角残图，墨线指着一处海底古魔遗迹。（得到时罗盘上就记下了方位）', glyph: '图', stack: true },
  { id: 'mat_hy_gumo', name: '古魔残晶', type: 'misc', tier: 4, price: 22000, desc: '海底古魔遗迹里封印阵的阵眼碎晶，紫光不散，摸上去像有心跳。', glyph: '晶', stack: true },
  { id: 'mat_hy_yuantie', name: '渊底玄铁', type: 'misc', tier: 4, price: 14000, desc: '万丈海渊下被水压了万年的玄铁，沉得一只手托不住。炼器、修补灵舟的上品。', glyph: '铁', stack: true },
  { id: 'mat_hy_haizhi', name: '万年海灵芝', type: 'misc', tier: 5, price: 68000, desc: '长在古魔遗迹残柱根下的海灵芝，吸了万年的海眼灵气，伞盖上浮着一层幽光。', glyph: '芝', stack: true },
  { id: 'mat_hy_chenmu', name: '沉船古木', type: 'misc', tier: 3, price: 2400, desc: '沉在海底的古船龙骨，泡了千年不腐。修补灵舟最好用。', glyph: '木', stack: true },
);

SEA_BEASTS.push(
  // 渊墟守卫：古魔遗迹里游弋的守卫，凶鱼的变种（借凶鱼的贴图，调成石青带紫的颜色）
  { id: 'sb_yiji_wei', name: '渊墟守卫', kind: 'beast', lv: [6, 7], lair: true, zone: 'sea', look: { body: 'fish', color: [70, 80, 96], belly: [150, 140, 190], size: 1.4, spikes: true, eye: 'rgba(200,150,255,1)' },
    minDanger: 99, maxDanger: -1, hp: 0.9, atk: 1.15, def: 1.0, speed: 280, melee: { range: 100, power: 1.3, cd: 1.3 }, aggro: 1000, title: '海兽·渊墟守卫', drops: [] },
  // 镇渊古傀：遗迹的小首领——古魔留下镇守封印的石傀（借海魔的头，调成青石色、眼里冒紫火）
  { id: 'sb_yiji_kui', name: '镇渊古傀', kind: 'beast', lv: [8, 8], lair: true, zone: 'sea', look: { body: 'jelly', color: [80, 90, 96], accent: [170, 110, 255], size: 2.4, eye: 'rgba(200,140,255,1)' },
    minDanger: 99, maxDanger: -1, hp: 2.4, atk: 1.35, def: 1.6, speed: 90, melee: { range: 220, power: 1.6, cd: 2 }, aggro: 1400, title: '海兽·渊主', drops: [] },
  // 守坛古魔影：潮汐祭坛守坛战里从坛里浮出的影子（借船灵的贴图，调成血红）
  { id: 'sb_tan_ying', name: '守坛古魔影', kind: 'ghost', lv: [7, 7], lair: true, zone: 'sea', evil: true, look: { body: 'ghost', color: [140, 60, 70], size: 1.6, eye: 'rgba(255,120,120,1)' },
    minDanger: 99, maxDanger: -1, hp: 1.2, atk: 1.2, def: 0.9, speed: 200, ranged: { fx: 'ghost', color: '255,120,140', range: 700, power: 1.0, cd: 2.6 }, aggro: 1100, title: '海兽·守坛', drops: [] },
);

// ================================================================ 收官 B4：别界险地里的怪（借五种海兽的行为与贴图，调色派生）
// 和上面一样：lair、minDanger 99（不进任何刷怪池），掉落留空（world/seabeast.ts 按险地配置的掉落另算）。
// 名字、称谓、二维回退时的颜色按样貌换；HD 场景里的调色在 world/jueyuLooks.ts 的 tint。
/** 一种样貌：介质代号、称谓前缀、二维画法的颜色往哪偏、五种行为各叫什么，触须与魂灯叫什么 */
const JY_KINDS: { m: string; title: string; rgb: [number, number, number]; names: [string, string, string, string, string]; ids: [string, string, string, string, string]; arm: string; lamp: string }[] = [
  { m: 'sand', title: '沙海', rgb: [200, 160, 100], names: ['沙鳞鲨', '流沙魔母', '噬沙巨虫', '蜃影', '风沙鹞'], ids: ['yu', 'mo', 'chong', 'ling', 'yao'], arm: '流沙触', lamp: '蜃珠' },
  { m: 'ice', title: '冰海', rgb: [170, 210, 245], names: ['冰鳞鱼', '玄冰海魔', '寒螭', '冰魄', '霜翼鳐'], ids: ['yu', 'mo', 'chi', 'po', 'yao'], arm: '冰触', lamp: '冰魄心灯' },
  { m: 'lava', title: '熔岩', rgb: [230, 100, 50], names: ['熔岩鱼', '炎魔', '熔岩火蛟', '火灵', '焰翼鳐'], ids: ['yu', 'mo', 'jiao', 'ling', 'yao'], arm: '熔岩触', lamp: '火灵心焰' },
  { m: 'ming', title: '冥河', rgb: [120, 190, 165], names: ['冥河怨鱼', '冥河魇母', '骨蛟', '引渡鬼', '冥鸦'], ids: ['yu', 'mo', 'jiao', 'gui', 'ya'], arm: '冥手', lamp: '渡魂灯' },
  { m: 'zhang', title: '瘴泽', rgb: [130, 170, 80], names: ['腐泽毒鱼', '千藤母', '瘴蛟', '瘴魅', '毒翅鳐'], ids: ['yu', 'teng', 'jiao', 'mei', 'yao'], arm: '巨藤', lamp: '瘴魅灯' },
];
const JY_BASE = ['sb_guichi', 'sb_mochu', 'sb_liehai', 'sb_chuanling', 'sb_leiyao'];
/** 二维回退的贴图登记要用（gfx/beastTex.ts）：每只派生怪借哪张图、往哪个颜色偏 */
export const JY_SPRITES: { id: string; base: string; rgb: [number, number, number] }[] = [];
{
  const byId = (id: string) => SEA_BEASTS.find((d) => d.id === id)!;
  const mixC = (c: number[] | undefined, t: number[]) => (c ? [Math.round(c[0] * 0.45 + t[0] * 0.55), Math.round(c[1] * 0.45 + t[1] * 0.55), Math.round(c[2] * 0.45 + t[2] * 0.55)] as [number, number, number] : undefined);
  for (const K of JY_KINDS) {
    JY_BASE.forEach((b, i) => {
      const src = byId(b), id = `jy_${K.m}_${K.ids[i]}`;
      const look = { ...src.look!, color: mixC(src.look!.color as number[], K.rgb)!, belly: mixC(src.look!.belly as number[] | undefined, K.rgb), accent: mixC(src.look!.accent as number[] | undefined, K.rgb) };
      SEA_BEASTS.push({ ...src, id, name: K.names[i], look: look as typeof src.look, title: `${K.title}·${K.names[i]}`, drops: [] });
      JY_SPRITES.push({ id, base: b, rgb: K.rgb });
    });
    // 触须、魂灯（海魔、船灵的子单位）
    const arm = byId('sb_mochu_xu'), lamp = byId('sb_chuanling_deng'), mo = `jy_${K.m}_${K.ids[1]}`, gl = `jy_${K.m}_${K.ids[3]}`;
    SEA_BEASTS.push({ ...arm, id: mo + '_xu', name: K.arm, title: `${K.title}·${K.arm}`, look: { ...arm.look!, color: mixC(arm.look!.color as number[], K.rgb)! } as typeof arm.look, drops: [] });
    SEA_BEASTS.push({ ...lamp, id: gl + '_deng', name: K.lamp, title: `${K.title}·${K.lamp}`, look: { ...lamp.look!, color: mixC(lamp.look!.color as number[], K.rgb)! } as typeof lamp.look, drops: [] });
  }
}
// 掉落的材料（一律 misc，理由同上）
SEA_ITEMS.push(
  { id: 'mat_jy_sand_1', name: '沙鲨鳞', type: 'misc', tier: 3, price: 1800, desc: '瀚漠界沙海里的怪身上剥下的鳞，边缘磨得像刀，炼器师拿它开刃。', glyph: '鳞', stack: true },
  { id: 'mat_jy_sand_2', name: '噬沙虫晶', type: 'misc', tier: 4, price: 28000, desc: '噬沙巨虫腹中结出的一块琥珀色晶石，吞了万斤流沙才凝成，内里沙粒还在缓缓流转。', glyph: '晶', stack: true },
  { id: 'mat_jy_ice_1', name: '玄冰鳞片', type: 'misc', tier: 3, price: 2000, desc: '寒渊冰海里的怪身上的鳞，离了冰海三日不化，握久了手指发僵。', glyph: '鳞', stack: true },
  { id: 'mat_jy_ice_2', name: '寒螭冰髓', type: 'misc', tier: 4, price: 30000, desc: '寒螭脊骨里的一截冰髓，寒气逼人。炼冰属法宝、压心火都用得上。', glyph: '髓', stack: true },
  { id: 'mat_jy_lava_1', name: '熔岩火鳞', type: 'misc', tier: 3, price: 2200, desc: '炎墟熔岩海里的怪身上的鳞，摸上去还是烫的。', glyph: '鳞', stack: true },
  { id: 'mat_jy_lava_2', name: '火蛟炎心', type: 'misc', tier: 4, price: 34000, desc: '熔岩火蛟的心火凝成的一团赤晶，放在掌心像揣着一颗小太阳。', glyph: '心', stack: true },
  { id: 'mat_jy_ming_1', name: '冥河磷骨', type: 'misc', tier: 3, price: 2100, desc: '幽冥冥河里的怪身上的骨，夜里泛着惨绿的磷光。鬼道修士用得着。', glyph: '骨', stack: true },
  { id: 'mat_jy_ming_2', name: '渡魂灯芯', type: 'misc', tier: 4, price: 32000, desc: '引渡鬼那盏灯的灯芯，熄了也冷冷发亮，能照见游魂。', glyph: '灯', stack: true },
  { id: 'mat_jy_zhang_1', name: '瘴泽毒囊', type: 'misc', tier: 3, price: 1900, desc: '灵木界瘴泽里的怪的毒囊，炼毒丹、制解瘴丹都离不了。', glyph: '囊', stack: true },
  { id: 'mat_jy_zhang_2', name: '千年藤心', type: 'misc', tier: 4, price: 29000, desc: '千藤母根下的一截藤心，木质里含着一缕青翠的生机，养魂木的近亲。', glyph: '藤', stack: true },
);
