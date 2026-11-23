// 近战兵器（第一批）：空手、剑、重兵（刀 / 锤）、长枪（枪 / 棍）。
// 这里只放和「物品、画面」有关的东西：种类名、说明、握法、长度、画法用的外形参数、各品阶的名字 / 形制 / 金属色。
// 出招手感（伤害倍率、出手快慢、判定范围……）由「把兵器接进近战出招」那一步加进 WeaponDef.feel，别的字段别改名。
// 兵器物品本身（wpn_<种类>_<品阶>，type 仍是 gear、槽位 weapon）在 data/gear.ts 里按这张表生成。

// r16 夜无赦（只增不改）：魂镰 scythe——只有噬魂魔尊会掉，最高阶是他的本命魂镰；形制 lian（长杆、杆头一弯月牙刃往回勾）。
export type WeaponKind = 'fist' | 'sword' | 'heavy' | 'spear' | 'scythe';
export const WEAPON_KINDS: WeaponKind[] = ['fist', 'sword', 'heavy', 'spear', 'scythe'];
/** 形制：剑 jian；重兵分刀 dao、锤 hammer；长枪分枪 qiang、棍 gun；魂镰 lian；空手 fist */
export type WeaponForm = 'fist' | 'jian' | 'dao' | 'hammer' | 'qiang' | 'gun' | 'lian';

/** 画法外形（人物局部单位：人高约 95）。grip 握把长、blade 刃 / 杆长（从护手或握点量起）、width 刃宽、head 锤头 / 枪头尺寸 */
export interface WeaponShape {
  /** 握把（含剑首）长 */ grip: number;
  /** 刃长（剑、刀）或杆长（锤、枪、棍；从主手握点往前量） */ blade: number;
  /** 刃宽（剑、刀）或杆粗（锤、枪、棍） */ width: number;
  /** 护手（剑格 / 刀镡）半宽；0 不画 */ guard: number;
  /** 锤头 / 枪头的长与宽；没有为 0 */ headL: number; headW: number;
  /** 主手握点之后还露出多长（枪尾、棍尾、锤柄尾） */ tail: number;
  /** 双手兵器：副手握在主手后面多远 */ gap: number;
}

export interface WeaponDef {
  kind: WeaponKind;
  name: string;
  /** 一句话说明（背包详情卡、试玩页角上） */
  desc: string;
  /** 1 单手 / 2 双手 */
  hands: 1 | 2;
  /** 全长（人物局部单位，人高约 95；画立板包围盒、刀光时参考） */
  length: number;
  /** 这一种兵器有哪几种形制（按品阶轮换，见 WEAPON_TIERS） */
  forms: WeaponForm[];
  /** 收着时挂在哪：back 斜背在背后 */
  sheath: 'back' | 'none';
  /** 出招手感的参数表（兵器谱：world/brawl.ts 的框架从这里读）。物品 / 画面这一层不读它 */
  feel: WeaponFeel;
}

/**
 * 兵器谱里轻击连段的一下。单位：伤害是攻力的倍数，削罡气是罡气点数（再乘境界差的系数），时间是秒。
 * at：拳 = 收式的前摇（只有收式有，其余 0：按下就出手）；兵器 = 这一下的判定落在动作开始后多少秒（落在 ACTION_HIT 那一段里，刀光、顿帧和它对齐）。
 */
export interface LightStep {
  dmg: number; poise: number;
  /** 命中时两人的单位级顿帧、对方的硬直 */ freeze: number; stagger: number;
  /** 收式：罡气已破就挑起（finLaunch） */ fin?: boolean;
  at: number;
  /** 横扫的弧度（正前方左右各一半；0 = 只认刃扫到的 / 近身圈里的那一个） */ arc?: number;
  /** 直刺穿人：沿刺向多长以内一条线上的都中（0 = 不穿） */ pierce?: number;
  /** 这一下最多打几个人（没写 = 1；横扫、穿刺才多） */ hits?: number;
}
/** 重击（崩山 / 斩 / 抡砸 / 挑 / 扫）的手感 */
export interface HeavyFeel {
  /** 前摇（拳 = 蓄力；兵器 = 判定落在动作开始后多少秒）、出手后定身、冷却 */ at: number; rec: number; cd: number;
  /** 伤血：平着打 / 往下砸 */ dmg: number; slamDmg: number;
  poise: number; freeze: number;
  /** 横扫的弧度、一下最多打几个人（拳 1） */ arc: number; maxHits: number;
  /** 直刺穿人（同 LightStep.pierce） */ pierce?: number;
}
/** 突进（欺身 / 剑的突进 / 重兵冲撞 / 枪的突刺） */
export interface RushFeel {
  speed: number; max: number; mp: number; cd: number;
  dmg: number; poise: number; stagger: number; freeze: number;
  /** 撞上时周围震开多远 */ shove: number;
  /** 一道直线：途中擦过的人也挨一下（伤害按 dmg 的这么多倍；0 = 只打扑向的那一个） */ line: number;
}
/** 一种兵器的出招手感（兵器谱的一页）。框架（架势、罡气、击飞、追击、脱困、拼招、定向、砸海、镜头）不分兵器，读这里的数 */
export interface WeaponFeel {
  /** 命中判定：near = 近身一个圈（拳脚，原来的做法）；blade = 刃轨迹在出手时段里扫过的范围 */
  hit: 'near' | 'blade';
  /** 够得着的距离（另加对方体型）；这么远以内出手会先垫一步扑过去、垫步的速度 */
  reach: number; lunge: number; lungeSpeed: number;
  /** 刃轨迹往外放几倍（刀光、判定都比兵器本身长：剑风、刀气、枪芒）；拳 1 */
  bladeExt: number;
  /** 轻击连段（几下就几项，最后一项一般是收式）；两下最短间隔、出手后定身、连段窗口、收式多定身一会儿 */
  light: LightStep[];
  gap: number; rec: number; win: number; finRec: number;
  /** 收式挑起：平地上飞多远、竖直初速 */
  finLaunch: { D: number; vz: number };
  heavy: HeavyFeel;
  /** 枪的「扫」：连段中按重击是横扫（没有就照常重击） */
  sweep?: HeavyFeel;
  /** 轰飞距离系数（乘在框架算出的距离和上下限上） */
  launchK: number;
  /** 出手到命中之间有霸体：不会被轻击打断（照样吃伤害） */
  armor: boolean;
  /** 重击默认带的上挑分量：0 = 平着轰飞；> 0 = 不按上升键也挑起（高度按框架的上挑乘它），按了再乘 upBoost */
  upLift: number; upBoost: number;
  rush: RushFeel;
  /** 剑气：斩出一道往前飞的弧光（射程、速度、伤害倍数、宽度） */
  wave?: { range: number; speed: number; dmg: number; w: number };
  /** 砸地震波：半径、伤害倍数、推开的力道 */
  quake?: { r: number; dmg: number; push: number };
  /** 架势提示条上的一句要点 */
  tip: string;
}

/**
 * 拳脚（第一份兵器谱）：数和兵器线之前 brawl.ts 里写死的常数一模一样（test-brawl 卡着逐位相同）。
 * 轻击四下（第四下收式：前摇 0.09，罡气已破就挑起）、重击崩山（前摇 0.14、冷却 0.55）、化虹欺身（2600 / 秒，最远 1800）。
 */
const FIST_FEEL: WeaponFeel = {
  hit: 'near', reach: 105, lunge: 380, lungeSpeed: 1700, bladeExt: 1,
  light: [
    { dmg: 0.55, poise: 18, freeze: 0.055, stagger: 0.24, at: 0 },
    { dmg: 0.55, poise: 18, freeze: 0.055, stagger: 0.24, at: 0 },
    { dmg: 0.55, poise: 18, freeze: 0.055, stagger: 0.24, at: 0 },
    { dmg: 0.9, poise: 30, freeze: 0.085, stagger: 0.45, at: 0.09, fin: true },
  ],
  gap: 0.15, rec: 0.13, win: 0.8, finRec: 0.12,
  finLaunch: { D: 380, vz: 980 },
  heavy: { at: 0.14, rec: 0.3, cd: 0.55, dmg: 1.5, slamDmg: 1.3, poise: 42, freeze: 0.085, arc: 0, maxHits: 1 },
  launchK: 1, armor: false, upLift: 0, upBoost: 1,
  rush: { speed: 2600, max: 1800, mp: 0.06, cd: 1, dmg: 1.0, poise: 34, stagger: 0.5, freeze: 0.08, shove: 200, line: 0 },
  tip: '贴身最快：四拳一收式，罡气打空一记崩山轰飞',
};

/**
 * 剑：距离中等，五式连环、出手快；伤血多、削罡气少（要多砍几下才破罡）。重击「斩」带一道往前飞的剑气（打得到几步外的人，比斩本身轻）；
 * 突进是一道直线（途中擦过的人也挨一剑）。判定按刃轨迹。at 都落在 gfx/character.ts 的 ACTION_HIT 那一段里。
 */
const SWORD_FEEL: WeaponFeel = {
  hit: 'blade', reach: 150, lunge: 420, lungeSpeed: 1900, bladeExt: 2.1,
  light: [
    { dmg: 0.62, poise: 11, freeze: 0.045, stagger: 0.2, at: 0.13, hits: 2 },
    { dmg: 0.62, poise: 11, freeze: 0.045, stagger: 0.2, at: 0.12, hits: 2 },
    { dmg: 0.66, poise: 12, freeze: 0.045, stagger: 0.22, at: 0.13, arc: 1.4, hits: 2 },
    { dmg: 0.7, poise: 13, freeze: 0.05, stagger: 0.22, at: 0.11, pierce: 90, hits: 2 },
    { dmg: 1.05, poise: 20, freeze: 0.075, stagger: 0.4, at: 0.2, fin: true, hits: 2 },
  ],
  gap: 0.12, rec: 0.1, win: 0.75, finRec: 0.1,
  finLaunch: { D: 420, vz: 900 },
  heavy: { at: 0.3, rec: 0.28, cd: 0.6, dmg: 1.75, slamDmg: 1.4, poise: 30, freeze: 0.08, arc: 1.0, maxHits: 2 },
  launchK: 0.85, armor: false, upLift: 0, upBoost: 1,
  rush: { speed: 3000, max: 1900, mp: 0.06, cd: 1, dmg: 1.1, poise: 28, stagger: 0.45, freeze: 0.07, shove: 160, line: 0.55 },
  wave: { range: 760, speed: 1700, dmg: 0.6, w: 90 },
  tip: '五式连环出手快、伤血多削罡少；重击一斩带剑气，打得到几步外',
};
/**
 * 重兵（刀、锤共用）：慢，三下一套，每下都横扫一片（弧里的人都中）；出手到命中之间有霸体（轻击打不断，照样吃伤害）；
 * 重击抡砸，砸地起一圈震波（范围击退）；削罡气最狠、轰得最远。
 */
const HEAVY_FEEL: WeaponFeel = {
  hit: 'blade', reach: 135, lunge: 300, lungeSpeed: 1400, bladeExt: 2.4,
  light: [
    { dmg: 0.8, poise: 30, freeze: 0.07, stagger: 0.32, at: 0.24, arc: 2.4, hits: 8 },
    { dmg: 0.85, poise: 32, freeze: 0.07, stagger: 0.32, at: 0.25, arc: 2.6, hits: 8 },
    { dmg: 1.15, poise: 48, freeze: 0.1, stagger: 0.55, at: 0.25, arc: 2.4, hits: 8, fin: true },
  ],
  gap: 0.3, rec: 0.26, win: 0.95, finRec: 0.12,
  finLaunch: { D: 520, vz: 1000 },
  heavy: { at: 0.4, rec: 0.45, cd: 0.9, dmg: 1.9, slamDmg: 1.6, poise: 70, freeze: 0.12, arc: 2.0, maxHits: 6 },
  launchK: 1.3, armor: true, upLift: 0, upBoost: 1,
  rush: { speed: 2200, max: 1500, mp: 0.07, cd: 1.2, dmg: 1.2, poise: 45, stagger: 0.6, freeze: 0.09, shove: 330, line: 0 },
  quake: { r: 300, dmg: 0.45, push: 460 },
  tip: '慢而沉：三下一套每下横扫一片，出手有霸体；抡砸震地，削罡最狠、轰得最远',
};
/**
 * 长枪（枪、棍共用）：最长；四下连段以直刺为主，直刺穿人（一条线上的都中），第三下横拦；
 * 重击默认是「挑」——不按上升键也把人挑起一截，按了更高；连段中按重击是「扫」（横扫一大片）；突刺扑得最远，也是一条直线。
 */
const SPEAR_FEEL: WeaponFeel = {
  hit: 'blade', reach: 200, lunge: 460, lungeSpeed: 1900, bladeExt: 1.5,
  light: [
    { dmg: 0.5, poise: 15, freeze: 0.05, stagger: 0.22, at: 0.12, pierce: 300, hits: 5 },
    { dmg: 0.52, poise: 15, freeze: 0.05, stagger: 0.22, at: 0.14, pierce: 300, hits: 5 },
    { dmg: 0.56, poise: 18, freeze: 0.05, stagger: 0.26, at: 0.16, arc: 1.6, hits: 3 },
    { dmg: 0.85, poise: 28, freeze: 0.08, stagger: 0.42, at: 0.18, pierce: 340, hits: 5, fin: true },
  ],
  gap: 0.17, rec: 0.14, win: 0.8, finRec: 0.12,
  finLaunch: { D: 460, vz: 940 },
  heavy: { at: 0.25, rec: 0.32, cd: 0.65, dmg: 1.4, slamDmg: 1.25, poise: 40, freeze: 0.085, arc: 0, maxHits: 1 },
  sweep: { at: 0.3, rec: 0.36, cd: 0.75, dmg: 1.2, slamDmg: 1.2, poise: 36, freeze: 0.08, arc: 2.9, maxHits: 6 },
  launchK: 0.9, armor: false, upLift: 0.55, upBoost: 1.2,
  rush: { speed: 3200, max: 2500, mp: 0.07, cd: 1, dmg: 1.15, poise: 32, stagger: 0.5, freeze: 0.08, shove: 200, line: 0.7 },
  tip: '最长：直刺穿人，重击自带上挑（连段中按是横扫），突刺扑得最远',
};
/**
 * 魂镰（r16 夜无赦掉的）：比人还长的双手长镰。三式一套，每下都是大弧——撩、横扫、回身劈（照夜无赦的「魂镰三式」），弧里的人都中，
 * 第三式收式挑起；重击「回旋」是抡一整圈（照「回旋魂镰」：身周一圈都中，伤血不算最重但打得多）；突进「空斩」一步冲到面前。
 * 介于重兵和长枪之间：够得远、扫得开，比重兵快、比枪沉；不带霸体。
 */
const SCYTHE_FEEL: WeaponFeel = {
  hit: 'blade', reach: 185, lunge: 420, lungeSpeed: 1800, bladeExt: 1.9,
  light: [
    { dmg: 0.66, poise: 20, freeze: 0.06, stagger: 0.26, at: 0.17, arc: 2.0, hits: 6 },
    { dmg: 0.7, poise: 22, freeze: 0.06, stagger: 0.28, at: 0.18, arc: 2.6, hits: 8 },
    { dmg: 1.05, poise: 36, freeze: 0.09, stagger: 0.48, at: 0.22, arc: 1.8, hits: 6, fin: true },
  ],
  gap: 0.2, rec: 0.18, win: 0.85, finRec: 0.12,
  finLaunch: { D: 480, vz: 1000 },
  heavy: { at: 0.32, rec: 0.34, cd: 0.75, dmg: 1.55, slamDmg: 1.35, poise: 48, freeze: 0.09, arc: 6.28, maxHits: 8 },
  launchK: 1.05, armor: false, upLift: 0.25, upBoost: 1.15,
  rush: { speed: 3100, max: 2000, mp: 0.07, cd: 1, dmg: 1.15, poise: 34, stagger: 0.5, freeze: 0.08, shove: 220, line: 0.6 },
  tip: '长镰大弧：三式一套弧里的人都中；重击回旋抡一整圈，突进空斩一步到面前',
};

export const WEAPONS: Record<WeaponKind, WeaponDef> = {
  fist: { kind: 'fist', name: '空手', desc: '拳脚功夫，贴身最快。护腕（拳套）的近战属性照样生效。', hands: 1, length: 0, forms: ['fist'], sheath: 'none', feel: FIST_FEEL },
  sword: { kind: 'sword', name: '剑', desc: '单手持剑，出手轻灵，五式连环，一斩破甲。', hands: 1, length: 44, forms: ['jian'], sheath: 'back', feel: SWORD_FEEL },
  heavy: { kind: 'heavy', name: '重兵', desc: '双手抡动的刀锤，出手沉、收手慢，一下砸下去罡气崩散。', hands: 2, length: 52, forms: ['dao', 'hammer'], sheath: 'back', feel: HEAVY_FEEL },
  spear: { kind: 'spear', name: '长枪', desc: '双手持枪（棍），比人还长，扎得远、扫得开，能挑能扫。', hands: 2, length: 118, forms: ['qiang', 'gun'], sheath: 'back', feel: SPEAR_FEEL },
  scythe: { kind: 'scythe', name: '魂镰', desc: '噬魂魔尊的兵器：比人还长的双手长镰，大弧横扫，回旋一圈。', hands: 2, length: 110, forms: ['lian'], sheath: 'back', feel: SCYTHE_FEEL },
};

/**
 * 兵器品阶给近战伤害的基础倍率（空手 1）：凡铁 1.02 → 通天 1.2，逐阶上升。兵器物品自己还带着近战属性（data/gear.ts：剑 melee 0.06 → 0.31、
 * 重兵 0.075 → 0.39，和护腕 0.04 → 0.21 一个量级），两样相乘：通天剑比凡铁剑重约五成四、比空手（不戴护腕）重约五成七。
 * 再往上加就会把同境界妖兽两三下打死（test-brawl 第 36 段量着）。
 */
export const WEAPON_TIER_MUL = [1.02, 1.04, 1.07, 1.1, 1.13, 1.16, 1.2];
export function weaponTierMul(kind: WeaponKind, tier: number): number { return kind === 'fist' ? 1 : WEAPON_TIER_MUL[Math.max(0, Math.min(6, Math.round(tier)))]; }

/**
 * 技能栏四式跟着手里的兵器变（id 不变，存档兼容）：名字、图标字、说明。空手就是原来的连拳 / 崩山击 / 化虹欺身 / 缩地。
 */
export interface MeleeArtView { name: string; glyph: string; desc: string }
export const MELEE_ART_VIEW: Record<Exclude<WeaponKind, 'fist'>, Record<'bx_lianquan' | 'bx_bengshan' | 'bx_qishen' | 'bx_suodi', MeleeArtView>> = {
  sword: {
    bx_lianquan: { name: '连斩', glyph: '斩', desc: '持剑连出五式（斜劈、反撩、平斩、直刺、回身劈），出手快、伤血重而削罡轻；第五式收剑，罡气已破的被挑上半空。' },
    bx_bengshan: { name: '断岳斩', glyph: '岳', desc: '拧身一记重斩，斩出一道往前飞的剑气，几步外的人也挨得到。罡气已破就朝鼠标所指之处斩飞；按住上升键上挑、下降键下劈。对方倒飞途中再按就是缩地追击。' },
    bx_qishen: { name: '惊鸿掠', glyph: '鸿', desc: '人剑合一，化作一道直线掠向锁定的对手，途中擦过的人也挨一剑。' },
    bx_suodi: { name: '缩地·剑影', glyph: '影', desc: '对方被斩飞途中，一步缩地截到前头再斩；一次倒飞最多追三次。自己被打飞时按，就是脱困。' },
  },
  heavy: {
    bx_lianquan: { name: '劈山三式', glyph: '劈', desc: '双手抡兵，三式一套，每一下都横扫面前一片；出手到砍中之间有霸体，轻击打不断。' },
    bx_bengshan: { name: '撼地', glyph: '撼', desc: '抡圆了往下一砸，地面震起一圈气浪把四周的人掀开；削罡最狠、轰得最远。按住上升键上撩、下降键砸进地里。' },
    bx_qishen: { name: '蛮牛冲阵', glyph: '冲', desc: '扛着兵器一头撞过去，撞上的人连同身边的都被震开。' },
    bx_suodi: { name: '缩地·压顶', glyph: '压', desc: '对方被轰飞途中，一步缩地截到前头再砸；一次倒飞最多追三次。自己被打飞时按，就是脱困。' },
  },
  spear: {
    bx_lianquan: { name: '连环刺', glyph: '刺', desc: '四下连环以直刺为主，一枪扎穿一条线上的人；第三下横拦，第四下回马刺收式。' },
    bx_bengshan: { name: '挑天', glyph: '挑', desc: '枪尖一挑，不按上升键也把人挑起一截，按了挑得更高；连段中按是横扫一大片。对方倒飞途中再按就是缩地追击。' },
    bx_qishen: { name: '白虹贯日', glyph: '虹', desc: '挺枪突刺，扑得最远，一条直线上的人都被扎到。' },
    bx_suodi: { name: '缩地·回马', glyph: '马', desc: '对方被挑飞途中，一步缩地截到前头再扎；一次倒飞最多追三次。自己被打飞时按，就是脱困。' },
  },
  scythe: {
    bx_lianquan: { name: '魂镰三式', glyph: '镰', desc: '撩、横扫、回身劈，三式一套，每一下都是一道大弧，弧里的人都中；第三式收镰，罡气已破的被挑上半空。' },
    bx_bengshan: { name: '回旋魂镰', glyph: '旋', desc: '抡镰回旋一整圈，身周一圈的人都挨一下。罡气已破就朝鼠标所指之处扫飞；按住上升键上撩、下降键下劈。' },
    bx_qishen: { name: '空斩', glyph: '空', desc: '一步冲到锁定的对手面前，镰随人到，途中擦过的人也挨一下。' },
    bx_suodi: { name: '缩地·勾魂', glyph: '勾', desc: '对方被扫飞途中，一步缩地截到前头再勾一镰；一次倒飞最多追三次。自己被打飞时按，就是脱困。' },
  },
};
/** 技能栏、法术书里这一门近战招式此刻叫什么（不是四式之一，或手里空着，返回 null：照原样显示） */
export function meleeArtView(id: string, kind: WeaponKind): MeleeArtView | null {
  if (kind === 'fist') return null;
  return (MELEE_ART_VIEW[kind] as Record<string, MeleeArtView>)[id] ?? null;
}
/** 界面层用的「主角手里此刻是什么兵器」（brawl.ts 每帧写；界面不必拿 Game 去算） */
export const HELD_NOW: { kind: WeaponKind; tier: number } = { kind: 'fist', tier: 0 };

export const WEAPON_SHAPE: Record<WeaponForm, WeaponShape> = {
  fist: { grip: 0, blade: 0, width: 0, guard: 0, headL: 0, headW: 0, tail: 0, gap: 0 },
  jian: { grip: 7.5, blade: 35, width: 1.2, guard: 3.0, headL: 0, headW: 0, tail: 3.2, gap: 0 },
  dao: { grip: 0, blade: 27, width: 5.6, guard: 2.6, headL: 0, headW: 0, tail: 17, gap: 9 },
  hammer: { grip: 0, blade: 30, width: 1.05, guard: 0, headL: 10, headW: 8, tail: 6, gap: 10 },
  qiang: { grip: 0, blade: 80, width: 0.95, guard: 0, headL: 11, headW: 2.6, tail: 30, gap: 18 },
  gun: { grip: 0, blade: 72, width: 1.15, guard: 0, headL: 0, headW: 0, tail: 38, gap: 20 },
  // 魂镰：杆长 blade（握点往前），镰刃从杆头往回勾 headL 那么长、离杆最远 headW
  lian: { grip: 0, blade: 66, width: 1.05, guard: 0, headL: 34, headW: 22, tail: 26, gap: 16 },
};

/** 各品阶：名字、形制、金属色（刃）、木 / 柄色、流光强度（0 不发光）、流光色 */
export interface WeaponTier { name: string; form: WeaponForm; metal: string; haft: string; glow: number; glowColor: string }
const T = (name: string, form: WeaponForm, metal: string, haft: string, glow: number, glowColor: string): WeaponTier => ({ name, form, metal, haft, glow, glowColor });
export const WEAPON_TIERS: Record<Exclude<WeaponKind, 'fist'>, WeaponTier[]> = {
  sword: [
    T('凡铁剑', 'jian', '#9aa0a2', '#4a3424', 0, '#ffffff'),
    T('青钢长剑', 'jian', '#b9cbc8', '#2f4a3a', 0, '#ffffff'),
    T('玄铁寒锋剑', 'jian', '#7f93a6', '#22262e', 0.12, '#bfe0ff'),
    T('紫电青霜剑', 'jian', '#c4b4ec', '#3a2a58', 0.3, '#c8a8ff'),
    T('赤霄宝剑', 'jian', '#f0b090', '#6a2018', 0.42, '#ffb070'),
    T('太阿古剑', 'jian', '#d8c48a', '#5a4420', 0.55, '#ffe0a0'),
    T('太虚斩天剑', 'jian', '#f4f0e0', '#c8b070', 0.75, '#fff4c8'),
  ],
  heavy: [
    T('凡铁厚背刀', 'dao', '#8e9294', '#4a3424', 0, '#ffffff'),
    T('熟铜瓜锤', 'hammer', '#c08a52', '#4a3424', 0, '#ffffff'),
    T('玄铁斩马刀', 'dao', '#78889a', '#22262e', 0.12, '#bfe0ff'),
    T('紫金八棱锤', 'hammer', '#b89ad0', '#3a2a40', 0.3, '#e0b8ff'),
    T('赤焰偃月刀', 'dao', '#f0a078', '#6a2018', 0.42, '#ff9a60'),
    T('镇岳古锤', 'hammer', '#c8b078', '#4a3a20', 0.55, '#ffe0a0'),
    T('太虚裂天刀', 'dao', '#f0ecdc', '#c8b070', 0.75, '#fff4c8'),
  ],
  spear: [
    T('齐眉木棍', 'gun', '#a08058', '#8a6a44', 0, '#ffffff'),
    T('白蜡杆枪', 'qiang', '#b4bcc0', '#cdb890', 0, '#ffffff'),
    T('玄铁盘龙棍', 'gun', '#68788a', '#2a2e36', 0.12, '#bfe0ff'),
    T('紫电游龙枪', 'qiang', '#c0b0e8', '#3a2a58', 0.3, '#c8a8ff'),
    T('赤焰点钢枪', 'qiang', '#f0aa80', '#6a2018', 0.42, '#ffa060'),
    T('定海古棍', 'gun', '#c8b478', '#5a4420', 0.55, '#ffe0a0'),
    T('太虚破军枪', 'qiang', '#f2eee0', '#c8b070', 0.75, '#fff4c8'),
  ],
  // 魂镰：铁色越往上越暗紫，流光是魔气的紫 / 血红；第七阶是夜无赦的本命魂镰
  scythe: [
    T('黑铁弯镰', 'lian', '#7c7e84', '#3a2a22', 0, '#ffffff'),
    T('勾魂镰', 'lian', '#8a8494', '#2e2228', 0.1, '#c8a8ff'),
    T('血槽魔镰', 'lian', '#8c6a72', '#3a1a1e', 0.22, '#ff6070'),
    T('幽冥收魂镰', 'lian', '#7a6c9c', '#221a30', 0.34, '#b080ff'),
    T('赤魇断魄镰', 'lian', '#a06878', '#4a1420', 0.46, '#ff5068'),
    T('九幽噬灵镰', 'lian', '#6e5a9a', '#1a1028', 0.6, '#c060ff'),
    T('噬魂本命魂镰', 'lian', '#4a3c66', '#5a1018', 0.8, '#d050ff'),
  ],
};

/** 人物外观里「手里的兵器」：种类、品阶（定颜色和流光）；本命飞剑当剑握时带上那口剑自己的光色 */
export interface WeaponLook { kind: WeaponKind; tier: number; form?: WeaponForm; color?: string }

const clampT = (t: number) => Math.max(0, Math.min(6, Math.round(t)));
/** 某种兵器某品阶的画法参数（金属色、柄色、流光） */
export function weaponTier(kind: WeaponKind, tier: number): WeaponTier | null {
  if (kind === 'fist') return null;
  return WEAPON_TIERS[kind][clampT(tier)];
}
/** 外观里的兵器 → 形制（没写就按品阶轮换） */
export function weaponForm(w: WeaponLook): WeaponForm {
  if (w.form) return w.form;
  const t = weaponTier(w.kind, w.tier);
  return t ? t.form : 'fist';
}
/** 兵器物品 id */
export const weaponItemId = (kind: Exclude<WeaponKind, 'fist'>, tier: number) => `wpn_${kind}_${clampT(tier)}`;
