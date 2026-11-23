// 第二十七步：对手的招式 —— 每个敌人 1～4 门技能 + 首领大招与分阶段狂暴
// 技能先在地上亮出预警（红圈 / 扇形 / 直线），到点才结算，玩家可以闪避或走出范围。
// 招式按“身形 × 五行”自动配给，原著妖王另有专属招式。
import type { Combat, Enemy } from './combat';
import type { StatusSpec } from '../data/arts';
import { ENEMIES } from '../data/enemies';
import { audio } from './audio';
import { preciseActorVisible } from './senseSignals';
import { schoolKit } from './schools';
import type { FormId } from './huaxing';
import { beastArts, beastBoomFx, beastCastFx } from './beastfx';

const TAU = Math.PI * 2;
const rand = (a: number, b: number) => a + Math.random() * (b - a);

export type El = 'phys' | 'fire' | 'ice' | 'water' | 'thunder' | 'poison' | 'blood' | 'ghost' | 'wind' | 'earth' | 'sword' | 'gold' | 'metal';
export type SkKind = 'salvo' | 'ring' | 'circle' | 'rain' | 'cone' | 'charge' | 'leap' | 'nova' | 'beam' | 'summon' | 'guard' | 'blink' | 'heal' | 'roar' | 'ying' | 'lines' | 'march' | 'track' | 'spiral' | 'fury';
export interface FoeSkill {
  id: string; name: string; k: SkKind; el: El; cd: number; tele: number; pow: number; range: number; min?: number;
  r?: number; n?: number; len?: number; w?: number; spread?: number; dur?: number; waves?: number;
  status?: StatusSpec; pool?: number; ult?: boolean; minion?: string; hpBelow?: number; once?: boolean;
  /** v0.54.2：灵力化形（出招时现出灵兽法相，见 world/npcshen.ts） */
  hx?: FormId;
  /** 落招形态标记（gl/beastgl.ts 按五行选画法；v0.63 起不再是像素特效名） */
  pfx?: string;
  /** v0.64：gapT = 连发间隔（track / spiral / march）；leech = 命中后按自身气血上限回补的比例；pull = 命中后把对手拖近的距离（负数为震退） */
  gapT?: number; leech?: number; pull?: number;
}

export const EL_COL: Record<El, string> = {
  phys: '230,200,160', fire: '255,120,40', ice: '150,215,255', water: '90,170,255', thunder: '170,190,255', poison: '140,220,70',
  blood: '230,40,60', ghost: '150,230,200', wind: '190,255,225', earth: '210,170,110', sword: '210,255,240', gold: '255,215,90', metal: '220,225,235',
};
const EL_NAME: Record<El, string> = { phys: '', fire: '火', ice: '冰', water: '水', thunder: '雷', poison: '毒', blood: '血', ghost: '阴', wind: '风', earth: '土', sword: '剑', gold: '金', metal: '金' };
/** 弹道外观 */
const EL_PROJ: Record<El, string> = { phys: 'rock', fire: 'fireball', ice: 'icicle', water: 'water', thunder: 'lightning', poison: 'vine', blood: 'blood', ghost: 'ghost', wind: 'wind', earth: 'rock', sword: 'sword', gold: 'goldthunder', metal: 'needle' };
/** 落点爆开的光效（复用法术特效） */
const EL_BOOM: Record<El, string> = { phys: 'rock', fire: 'flame', ice: 'frost', water: 'water', thunder: 'lightning', poison: 'poison', blood: 'blood', ghost: 'ghost', wind: 'wind', earth: 'rock', sword: 'sword', gold: 'goldthunder', metal: 'sword' };
const EL_ST: Partial<Record<El, StatusSpec>> = {
  fire: { k: 'burn', dur: 3, ch: 0.5 }, ice: { k: 'slow', dur: 2.5, ch: 0.6 }, thunder: { k: 'shock', dur: 0.8, ch: 0.4 }, poison: { k: 'poison', dur: 5, ch: 0.7 },
  blood: { k: 'break', dur: 4, ch: 0.4 }, ghost: { k: 'slow', dur: 2, ch: 0.5 }, water: { k: 'slow', dur: 2, ch: 0.4 }, earth: { k: 'knock', dur: 0.3, ch: 0.6 },
};

/** 地上的预警 / 持续区域 */
export interface Hz {
  k: 'circle' | 'cone' | 'line'; x: number; y: number; r: number; ang: number; spread: number; len: number; w: number;
  t: number; tele: number; dur: number; el: El; dmg: number; realm: number; status?: StatusSpec; src?: Enemy;
  fired: boolean; tick: number; pool?: number; big?: boolean; vis?: boolean; pooling?: boolean; hitDone?: boolean; warned?: boolean; pfx?: string;
  /** v0.64：吸取 / 摄引；grp = 同一轮齐发的预警（一轮至多命中你一次） */
  leech?: number; pull?: number; grp?: { hit: boolean };
  /** v0.70：问道残卷观招——来自哪一式、同一次出手共用的记账；wasIn = 预警期间你曾站在里面 */
  sid?: string; cj?: { seen?: boolean; hit?: boolean; dodge?: boolean }; wasIn?: boolean;
}

// ------------------------------------------------------------------ 配招
export function elOf(e: Enemy): El {
  const d = e.def, fx = d.ranged?.fx;
  const m: Record<string, El> = { fireball: 'fire', flame: 'fire', icicle: 'ice', water: 'water', blood: 'blood', ghost: 'ghost', mind: 'ghost', wind: 'wind', tornado: 'wind', lightning: 'thunder', goldthunder: 'gold', vine: 'poison', needle: 'metal', rock: 'earth', sword: 'sword' };
  if (fx && m[fx]) return m[fx];
  if (d.kind === 'ghost') return d.look?.body === 'corpse' ? 'poison' : 'ghost';
  if (d.zone === 'cold') return 'ice';
  if (d.zone === 'demon' || d.evil) return 'blood';
  if (d.zone === 'sea') return 'water';
  const b = d.look?.body;
  if (b === 'spider' || b === 'scorpion' || b === 'centipede' || b === 'toad' || b === 'snake') return 'poison';
  if (b === 'corpse') return 'poison';
  return 'phys';
}

const S = (o: Partial<FoeSkill> & { id: string; name: string; k: SkKind }, el: El): FoeSkill => ({ el, cd: 7, tele: 0.8, pow: 1.8, range: 520, ...o } as FoeSkill);

function rainName(el: El) { return ({ fire: '火雨', ice: '冰锥雨', water: '水箭雨', thunder: '落雷', poison: '毒雨', blood: '血雨', ghost: '鬼火雨', wind: '风刃雨', earth: '落石', sword: '剑雨', gold: '金雷落', metal: '金针雨', phys: '落石' } as Record<El, string>)[el]; }
function breathName(el: El) { return ({ fire: '烈焰吐息', ice: '寒霜吐息', water: '水龙吐息', thunder: '雷霆吐息', poison: '毒雾喷吐', blood: '血煞喷吐', ghost: '阴风', wind: '狂风吐息', earth: '沙暴', sword: '剑气横扫', gold: '金光', metal: '金芒', phys: '咆哮' } as Record<El, string>)[el]; }

/** 按身形 + 五行配招（数量随等阶增加） */
function autoKit(e: Enemy): FoeSkill[] {
  const d = e.def, el = elOf(e), b = d.look?.body ?? (d.kind === 'human' ? 'human' : 'ghost');
  const pool: FoeSkill[] = [];
  const elN = EL_NAME[el];
  const st = EL_ST[el];
  const breath = S({ id: 'breath', name: breathName(el), k: 'cone', r: 300, spread: 0.5, tele: 0.85, pow: 2.1, range: 300, cd: 8, status: st, pool: el === 'fire' || el === 'poison' ? 3 : 0 }, el === 'phys' ? 'wind' : el);
  const rain = S({ id: 'rain', name: rainName(el), k: 'rain', n: 5, r: 85, tele: 1.0, pow: 1.7, range: 560, cd: 9, status: st, pool: el === 'poison' || el === 'fire' ? 2.5 : 0 }, el === 'phys' ? 'earth' : el);
  const salvo = S({ id: 'salvo', name: `${elN || '妖'}弹连发`, k: 'salvo', n: 3, waves: 3, spread: 0.5, tele: 0.35, pow: 0.75, range: 560, min: 140, cd: 6 }, el === 'phys' ? 'earth' : el);
  switch (b) {
    case 'wolf': case 'fox': case 'tiger': case 'deer': case 'horse': case 'rat':
      pool.push(S({ id: 'pounce', name: b === 'tiger' ? '猛虎扑杀' : '扑杀', k: 'leap', r: 95, tele: 0.75, pow: 1.9, range: 430, min: 110, cd: 6 }, 'phys'));
      pool.push(S({ id: 'claw', name: '裂爪', k: 'cone', r: 160, spread: 0.85, tele: 0.45, pow: 1.6, range: 150, cd: 5, status: { k: 'break', dur: 3, ch: 0.4 } }, 'phys'));
      if (b === 'wolf' && !d.lair) pool.push(S({ id: 'howl', name: '啸聚群狼', k: 'summon', n: 2, minion: d.id, tele: 0.8, range: 900, cd: 30, once: true, hpBelow: 0.75 }, 'phys'));
      if (b === 'tiger') pool.push(S({ id: 'roar', name: '虎啸山林', k: 'roar', r: 230, tele: 0.7, pow: 0.9, range: 230, cd: 14, status: { k: 'stun', dur: 0.8, ch: 0.6 } }, el === 'phys' ? 'wind' : el));
      if (el !== 'phys') pool.push(el === 'fire' || el === 'ice' || el === 'wind' ? breath : rain);
      break;
    case 'boar': case 'ox': case 'pangolin': case 'croc':
      pool.push(S({ id: 'charge', name: b === 'boar' ? '推山冲撞' : b === 'ox' ? '蛮牛冲阵' : '冲撞', k: 'charge', len: 560, w: 90, tele: 0.75, pow: 2.2, range: 520, min: 120, cd: 6, status: { k: 'knock', dur: 0.4, ch: 0.9 } }, 'earth'));
      pool.push(S({ id: 'stomp', name: '践踏', k: 'nova', r: 180, tele: 0.75, pow: 1.8, range: 170, cd: 7, status: { k: 'slow', dur: 2, ch: 0.6 } }, 'earth'));
      if (b === 'pangolin' || b === 'croc') pool.push(S({ id: 'guard', name: '铁甲', k: 'guard', dur: 4, tele: 0.3, range: 600, cd: 16 }, 'earth'));
      if (el !== 'phys') pool.push(el === 'wind' ? breath : rain);
      break;
    case 'snake': case 'jiao': case 'shark': case 'fish': case 'carp':
      pool.push(S({ id: 'lunge', name: '蛇吻疾噬', k: 'charge', len: 360, w: 70, tele: 0.55, pow: 1.9, range: 340, min: 90, cd: 5, status: st }, el === 'phys' ? 'poison' : el));
      pool.push(breath.el === 'wind' && el === 'phys' ? S({ ...breath, el: 'poison', name: '毒雾喷吐' }, 'poison') : breath);
      if (b === 'jiao' || e.blv >= 5) pool.push(S({ id: 'beam', name: el === 'water' ? '蛟龙水箭' : el === 'fire' ? '烈焰龙息' : el === 'blood' ? '血煞光' : el === 'gold' ? '金雷光柱' : `${elN}光`, k: 'beam', len: 680, w: 70, tele: 0.95, dur: 0.6, pow: 2.5, range: 640, min: 120, cd: 10, status: st }, el === 'phys' ? 'water' : el));
      pool.push(S({ id: 'tail', name: '神龙摆尾', k: 'nova', r: 190, tele: 0.7, pow: 1.8, range: 180, cd: 7, status: { k: 'knock', dur: 0.4, ch: 0.9 } }, el === 'phys' ? 'water' : el));
      pool.push(rain);
      break;
    case 'eagle': case 'bat':
      pool.push(S({ id: 'dive', name: '俯冲扑击', k: 'charge', len: 620, w: 80, tele: 0.65, pow: 2, range: 560, min: 100, cd: 6 }, el === 'phys' ? 'wind' : el));
      pool.push(S({ id: 'feather', name: b === 'bat' ? '血翼音刃' : '羽刃', k: 'salvo', n: 7, waves: 1, spread: 1.1, tele: 0.45, pow: 0.9, range: 560, min: 120, cd: 6 }, el === 'phys' ? 'wind' : el));
      pool.push(S({ id: 'gale', name: el === 'thunder' ? '雷暴' : '旋风', k: 'circle', r: 120, tele: 0.9, pow: 1.9, range: 520, cd: 8, status: el === 'thunder' ? EL_ST.thunder : { k: 'slow', dur: 2, ch: 0.6 }, pool: 2 }, el === 'phys' ? 'wind' : el));
      pool.push(rain.el === 'earth' ? S({ ...rain, el: 'wind', name: '风刃雨' }, 'wind') : rain);
      break;
    case 'ape': case 'bear': case 'corpse': case 'yaksha': case 'turtle':
      pool.push(S({ id: 'slam', name: b === 'turtle' ? '玄甲压顶' : '泰山压顶', k: 'leap', r: 140, tele: 0.9, pow: 2.4, range: 420, min: 100, cd: 7, status: { k: 'stun', dur: 0.6, ch: 0.5 } }, 'earth'));
      pool.push(S({ id: 'quake', name: '震地', k: 'nova', r: 230, tele: 0.95, pow: 2, range: 220, cd: 8, status: { k: 'slow', dur: 2, ch: 0.7 } }, 'earth'));
      if (b === 'turtle' || b === 'ape') pool.push(S({ id: 'guard', name: b === 'turtle' ? '龟甲护体' : '金刚护体', k: 'guard', dur: 4, tele: 0.3, range: 600, cd: 15 }, 'earth'));
      if (b === 'corpse' || b === 'yaksha') pool.push(S({ id: 'claw', name: '尸爪撕裂', k: 'cone', r: 170, spread: 0.9, tele: 0.45, pow: 1.7, range: 160, cd: 5, status: EL_ST.poison }, 'poison'));
      pool.push(S({ id: 'rocks', name: rainName(el === 'phys' ? 'earth' : el), k: 'rain', n: 5, r: 90, tele: 1.0, pow: 1.7, range: 560, cd: 9, status: EL_ST[el === 'phys' ? 'earth' : el] }, el === 'phys' ? 'earth' : el));
      break;
    case 'spider': case 'scorpion': case 'centipede': case 'ant': case 'mantis':
      if (b === 'spider') pool.push(S({ id: 'web', name: '缚灵蛛网', k: 'circle', r: 120, tele: 0.75, pow: 1.1, range: 520, cd: 8, status: { k: 'root', dur: 1.6, ch: 0.9 } }, 'poison'));
      if (b === 'scorpion') pool.push(S({ id: 'sting', name: '毒尾刺', k: 'beam', len: 300, w: 50, tele: 0.5, dur: 0.25, pow: 2.1, range: 280, cd: 5, status: EL_ST.poison }, 'poison'));
      if (b === 'centipede') pool.push(S({ id: 'rush', name: '百足疾冲', k: 'charge', len: 600, w: 80, tele: 0.6, pow: 2, range: 560, min: 100, cd: 6, status: st ?? EL_ST.poison }, el === 'phys' ? 'poison' : el));
      if (b === 'ant') pool.push(S({ id: 'swarm', name: '蚁群', k: 'summon', n: 3, minion: d.id, tele: 0.8, range: 900, cd: 25, once: true, hpBelow: 0.8 }, 'fire'));
      if (b === 'mantis') pool.push(S({ id: 'scythe', name: '双镰斩', k: 'cone', r: 190, spread: 0.7, tele: 0.4, pow: 1.5, range: 180, cd: 4, waves: 2 }, 'sword'));
      pool.push(S({ id: 'spit', name: el === 'ice' ? '冰蚕寒丝' : '毒液喷吐', k: 'salvo', n: 3, waves: 2, spread: 0.45, tele: 0.4, pow: 0.8, range: 520, min: 100, cd: 6, status: st ?? EL_ST.poison }, el === 'phys' ? 'poison' : el));
      pool.push(S({ id: 'miasma', name: el === 'ice' ? '寒雾' : '毒瘴', k: 'rain', n: 4, r: 95, tele: 1.0, pow: 1.3, range: 520, cd: 10, status: st ?? EL_ST.poison, pool: 3 }, el === 'phys' ? 'poison' : el));
      break;
    case 'toad': case 'jelly': case 'urchin':
      if (b === 'urchin') pool.push(S({ id: 'needles', name: '千目针雨', k: 'ring', n: 18, waves: 2, tele: 0.5, pow: 0.8, range: 520, cd: 6 }, 'metal'));
      else pool.push(S({ id: 'ring', name: b === 'toad' ? '毒泡' : '水泡', k: 'ring', n: 12, waves: 1, tele: 0.55, pow: 0.8, range: 480, cd: 7, status: st }, el === 'phys' ? 'poison' : el));
      pool.push(S({ id: 'tongue', name: b === 'toad' ? '长舌' : '触须', k: 'beam', len: 400, w: 40, tele: 0.5, dur: 0.25, pow: 1.6, range: 380, cd: 5, status: { k: 'slow', dur: 2, ch: 0.7 } }, el === 'phys' ? 'poison' : el));
      pool.push(rain.el === 'earth' ? S({ ...rain, el: 'poison', name: '毒雨', pool: 3 }, 'poison') : rain);
      pool.push(S({ id: 'burst', name: '爆浆', k: 'nova', r: 200, tele: 0.8, pow: 1.8, range: 190, cd: 8, status: st, pool: el === 'fire' || el === 'poison' ? 3 : 0 }, el === 'phys' ? 'poison' : el));
      break;
    case 'ghost': case 'demon':
      pool.push(S({ id: 'blink', name: d.evil ? '魔影闪' : '鬼影瞬移', k: 'blink', tele: 0.25, pow: 1.5, range: 600, min: 150, cd: 7 }, el));
      pool.push(S({ id: 'wail', name: el === 'blood' ? '血煞环' : '万鬼哭嚎', k: 'ring', n: 14, waves: 2, tele: 0.6, pow: 0.75, range: 520, cd: 8, status: st }, el));
      pool.push(S({ id: 'soul', name: el === 'blood' ? '血爆' : '摄魂', k: 'circle', r: 115, tele: 0.85, pow: 1.9, range: 520, cd: 7, status: el === 'blood' ? EL_ST.blood : { k: 'stun', dur: 0.7, ch: 0.5 } }, el));
      pool.push(S({ id: 'call', name: '招魂', k: 'summon', n: 2, minion: 'yinhun', tele: 0.9, range: 900, cd: 30, once: true, hpBelow: 0.7 }, 'ghost'));
      pool.push(rain);
      break;
    default: break;
  }
  // 招式不足三式的，补上妖啸 / 天降之术
  if (pool.length < 3 && !pool.some((s) => s.id === 'roar')) pool.push(S({ id: 'roar', name: '妖啸', k: 'roar', r: 220, tele: 0.7, pow: 0.8, range: 220, cd: 14, status: { k: 'stun', dur: 0.6, ch: 0.5 } }, el === 'phys' ? 'wind' : el));
  if (pool.length < 4 && !pool.some((s) => s.k === 'rain')) pool.push(rain);
  return pool;
}

/** 修士：按门派流派出招（第三十五步：schools.ts），境界越高招越多，结丹以上祭出大招 */
function humanKit(e: Enemy): FoeSkill[] { return schoolKit(e, !!e.affix || isBoss(e)).concat(shenKit(e)); }

/** v0.54.2：结丹修士会灵力化形（一形，首领 / 元婴两形），元婴修士还会元婴出窍。
 *  化形的招式照旧先在地上亮预警，到点才落实；灵兽法相由 world/npcshen.ts 画。 */
const HX_SK: Record<FormId, () => FoeSkill> = {
  long: () => S({ id: 'hx_long', name: '化形·青龙', k: 'beam', len: 900, w: 150, tele: 1.0, dur: 0.35, pow: 2.2, range: 820, min: 120, cd: 15, hx: 'long' }, 'water'),
  feng: () => S({ id: 'hx_feng', name: '化形·火凤', k: 'circle', r: 210, tele: 1.15, pow: 2.0, range: 700, cd: 16, status: EL_ST.fire, pool: 3, hx: 'feng' }, 'fire'),
  hu: () => S({ id: 'hx_hu', name: '化形·白虎', k: 'circle', r: 130, tele: 0.75, pow: 2.2, range: 620, cd: 12, status: { k: 'break', dur: 4, ch: 0.8 }, hx: 'hu' }, 'metal'),
  gui: () => S({ id: 'hx_gui', name: '化形·玄武', k: 'guard', tele: 0.6, dur: 8, pow: 0, range: 9999, cd: 24, hx: 'gui' }, 'water'),
  peng: () => S({ id: 'hx_peng', name: '化形·雷鹏', k: 'rain', n: 6, r: 95, tele: 0.95, pow: 1.2, range: 760, cd: 15, status: { k: 'shock', dur: 0.8, ch: 0.5 }, hx: 'peng' }, 'thunder'),
  qilin: () => S({ id: 'hx_qilin', name: '化形·麒麟', k: 'circle', r: 250, tele: 1.2, pow: 2.0, range: 640, cd: 16, status: { k: 'stun', dur: 1, ch: 0.7 }, hx: 'qilin' }, 'earth'),
  yuan: () => S({ id: 'hx_yuan', name: '化形·魔猿', k: 'cone', r: 380, spread: 0.85, tele: 0.9, pow: 2.1, range: 360, cd: 13, status: { k: 'knock', dur: 0.3, ch: 0.9 }, hx: 'yuan' }, 'earth'),
};
const HX_ORDER: FormId[] = ['long', 'feng', 'hu', 'gui', 'peng', 'qilin', 'yuan'];
/** 按名字定下这个人修的是哪一形（同一个人每次都一样）；魔修偏魔猿 / 火凤，剑修偏白虎 / 青龙 */
export function formsOf(name: string, n: number, evil = false): FormId[] {
  let h = 2166136261; for (let i = 0; i < name.length; i++) { h ^= name.charCodeAt(i); h = Math.imul(h, 16777619); }
  h >>>= 0;
  const pool = evil ? ['yuan', 'feng', 'long', 'peng', 'qilin', 'hu', 'gui'] as FormId[] : HX_ORDER;
  const out: FormId[] = [pool[h % (evil ? 3 : pool.length)]];
  if (n > 1) { const b = pool[(h >>> 5) % pool.length]; out.push(b !== out[0] ? b : pool[(pool.indexOf(b) + 1) % pool.length]); }
  return out;
}
export function shenKit(e: Enemy): FoeSkill[] {
  if (e.def.kind !== 'human' || e.realm < 3 || (e as any).shell) return [];
  const out = formsOf(e.name, e.realm >= 4 || isBoss(e) ? 2 : 1, !!e.def.evil).map((f) => HX_SK[f]());
  if (e.realm >= 4) out.push(S({ id: 'yy_out', name: '元婴出窍', k: 'ying', tele: 0.8, pow: 1.2, range: 900, cd: 42, hpBelow: 0.9 }, 'gold'));
  return out;
}

/** 第三十二步：追杀者另带困灵阵、定身符——专门留人 */
export function pursuerKit(e: Enemy): FoeSkill[] {
  const out = humanKit(e).filter((s) => s.k !== 'blink');
  out.push(S({ id: 'p_trap', name: '困灵阵', k: 'circle', r: 150, tele: 0.75, pow: 1.2, range: 620, cd: 11, status: { k: 'root', dur: 1.6, ch: 0.85 }, pool: 2.5 }, 'earth'));
  out.push(S({ id: 'p_seal', name: '定身符', k: 'salvo', n: 3, waves: 1, spread: 0.35, tele: 0.35, pow: 0.7, range: 640, min: 120, cd: 9, status: { k: 'stun', dur: 0.6, ch: 0.45 } }, 'gold'));
  return out;
}

/** 原著妖王 / 魔物：专属招式与大招 */
const LAIR_KIT: Record<string, (e: Enemy) => FoeSkill[]> = {
  mojiao: () => [
    S({ id: 'mj_water', name: '腐水喷吐', k: 'cone', r: 330, spread: 0.55, tele: 0.85, pow: 2.1, range: 320, cd: 7, status: EL_ST.poison, pool: 3.5 }, 'poison'),
    S({ id: 'mj_rain', name: '紫毒雨', k: 'rain', n: 7, r: 90, tele: 1.05, pow: 1.7, range: 600, cd: 9, status: EL_ST.poison, pool: 3 }, 'poison'),
    S({ id: 'mj_tail', name: '墨蛟摆尾', k: 'nova', r: 220, tele: 0.75, pow: 1.9, range: 210, cd: 7, status: { k: 'knock', dur: 0.4, ch: 0.9 } }, 'water'),
    S({ id: 'mj_ult', name: '墨蛟翻江', k: 'beam', len: 800, w: 110, tele: 1.2, dur: 0.8, pow: 3, range: 760, cd: 16, ult: true, status: EL_ST.poison }, 'water'),
  ],
  gumo_xueyan: () => [
    S({ id: 'gm_rain', name: '血焰天降', k: 'rain', n: 9, r: 100, tele: 1.0, pow: 2, range: 660, cd: 8, status: EL_ST.fire, pool: 3 }, 'blood'),
    S({ id: 'gm_beam', name: '血焰柱', k: 'beam', len: 820, w: 120, tele: 1.0, dur: 0.7, pow: 2.8, range: 760, cd: 9 }, 'blood'),
    S({ id: 'gm_ring', name: '魔焰环', k: 'ring', n: 22, waves: 3, tele: 0.7, pow: 0.9, range: 600, cd: 9 }, 'blood'),
    S({ id: 'gm_blink', name: '魔影闪', k: 'blink', tele: 0.25, pow: 1.8, range: 700, min: 160, cd: 7 }, 'blood'),
    S({ id: 'gm_call', name: '召唤魔物', k: 'summon', n: 3, minion: 'zhenmo', tele: 1, range: 900, cd: 40, once: true, hpBelow: 0.6 }, 'blood'),
    S({ id: 'gm_ult', name: '血焰焚天', k: 'nova', r: 420, tele: 1.6, pow: 3.6, range: 420, cd: 18, ult: true, status: EL_ST.fire, pool: 3 }, 'blood'),
  ],
  yinchi: () => [
    S({ id: 'yc_dive', name: '银翅俯冲', k: 'charge', len: 700, w: 100, tele: 0.6, pow: 2.3, range: 640, min: 100, cd: 5 }, 'wind'),
    S({ id: 'yc_feather', name: '银羽风刃', k: 'ring', n: 18, waves: 2, tele: 0.55, pow: 0.9, range: 560, cd: 7 }, 'wind'),
    S({ id: 'yc_leap', name: '夜叉扑杀', k: 'leap', r: 130, tele: 0.8, pow: 2.4, range: 480, min: 100, cd: 6 }, 'phys'),
    S({ id: 'yc_ult', name: '银翅风暴', k: 'rain', n: 12, r: 110, tele: 1.2, pow: 2.2, range: 700, cd: 16, ult: true, status: { k: 'slow', dur: 2, ch: 0.7 }, pool: 2 }, 'wind'),
  ],
  dujiao: () => [
    S({ id: 'dj_breath', name: '毒煞吐息', k: 'cone', r: 340, spread: 0.55, tele: 0.85, pow: 2.2, range: 330, cd: 7, status: EL_ST.poison, pool: 3 }, 'poison'),
    S({ id: 'dj_beam', name: '血毒光', k: 'beam', len: 760, w: 90, tele: 0.95, dur: 0.6, pow: 2.6, range: 720, cd: 9, status: EL_ST.poison }, 'blood'),
    S({ id: 'dj_tail', name: '摆尾', k: 'nova', r: 220, tele: 0.75, pow: 2, range: 210, cd: 7 }, 'poison'),
    S({ id: 'dj_ult', name: '万毒蚀天', k: 'rain', n: 12, r: 105, tele: 1.2, pow: 2.2, range: 700, cd: 16, ult: true, status: EL_ST.poison, pool: 4 }, 'poison'),
  ],
  shuanggong: () => [
    S({ id: 'sg_breath', name: '极寒毒液', k: 'cone', r: 340, spread: 0.55, tele: 0.8, pow: 2.2, range: 330, cd: 6, status: { k: 'freeze', dur: 1.2, ch: 0.5 } }, 'ice'),
    S({ id: 'sg_rush', name: '六翼疾掠', k: 'charge', len: 720, w: 100, tele: 0.55, pow: 2.3, range: 680, min: 100, cd: 5 }, 'ice'),
    S({ id: 'sg_rain', name: '冰锥雨', k: 'rain', n: 9, r: 95, tele: 1.0, pow: 1.9, range: 640, cd: 9, status: EL_ST.ice }, 'ice'),
    S({ id: 'sg_ult', name: '冰封千里', k: 'nova', r: 440, tele: 1.6, pow: 3.4, range: 440, cd: 18, ult: true, status: { k: 'freeze', dur: 1.5, ch: 0.8 } }, 'ice'),
  ],
  fengxi: () => [
    S({ id: 'fx_gale', name: '裂风旋', k: 'rain', n: 7, r: 110, tele: 1.0, pow: 2, range: 640, cd: 8, status: { k: 'slow', dur: 2, ch: 0.7 }, pool: 2 }, 'wind'),
    S({ id: 'fx_blades', name: '风刃', k: 'ring', n: 20, waves: 2, tele: 0.55, pow: 0.9, range: 600, cd: 7 }, 'wind'),
    S({ id: 'fx_dive', name: '裂风扑击', k: 'charge', len: 760, w: 110, tele: 0.55, pow: 2.4, range: 700, min: 100, cd: 5 }, 'wind'),
    S({ id: 'fx_ult', name: '裂空风刃', k: 'beam', len: 900, w: 150, tele: 1.3, dur: 0.8, pow: 3.4, range: 860, cd: 16, ult: true }, 'wind'),
  ],
};

// 第三十五步：新增妖王
Object.assign(LAIR_KIT, {
  jinjiaowang: () => [
    S({ id: 'jj_beam', name: '金蛟雷光', k: 'beam', len: 820, w: 100, tele: 0.9, dur: 0.6, pow: 2.7, range: 780, min: 120, cd: 8, status: { k: 'shock', dur: 1, ch: 0.6 } }, 'gold'),
    S({ id: 'jj_rain', name: '金雷落', k: 'rain', n: 8, r: 100, tele: 1.0, pow: 2, range: 660, cd: 9, status: { k: 'shock', dur: 0.8, ch: 0.5 } }, 'gold'),
    S({ id: 'jj_tail', name: '蛟尾断海', k: 'nova', r: 240, tele: 0.75, pow: 2.1, range: 230, cd: 7, status: { k: 'knock', dur: 0.4, ch: 0.9 } }, 'water'),
    S({ id: 'jj_call', name: '号令蛟族', k: 'summon', n: 2, minion: 'jiaojiao', tele: 1, range: 900, cd: 40, once: true, hpBelow: 0.65 }, 'water'),
    S({ id: 'jj_ult', name: '金蛟翻海·万雷', k: 'rain', n: 14, r: 110, tele: 1.3, pow: 2.4, range: 760, cd: 16, ult: true, status: { k: 'shock', dur: 1, ch: 0.6 } }, 'gold'),
  ],
  bingfeng: () => [
    S({ id: 'bf_feather', name: '冰翎', k: 'ring', n: 22, waves: 3, tele: 0.6, pow: 0.95, range: 640, cd: 7, status: { k: 'slow', dur: 2, ch: 0.6 } }, 'ice'),
    S({ id: 'bf_breath', name: '冰凤寒息', k: 'cone', r: 380, spread: 0.6, tele: 0.85, pow: 2.3, range: 360, cd: 7, status: { k: 'freeze', dur: 1.3, ch: 0.6 } }, 'ice'),
    S({ id: 'bf_dive', name: '凤击长空', k: 'charge', len: 800, w: 120, tele: 0.55, pow: 2.5, range: 760, min: 100, cd: 5 }, 'ice'),
    S({ id: 'bf_blink', name: '冰遁', k: 'blink', tele: 0.2, pow: 1.8, range: 700, min: 160, cd: 7 }, 'ice'),
    S({ id: 'bf_ult', name: '冰封万里', k: 'nova', r: 480, tele: 1.6, pow: 3.6, range: 480, cd: 17, ult: true, status: { k: 'freeze', dur: 1.6, ch: 0.85 } }, 'ice'),
  ],
});

/** 首领通用大招 */
function ultFor(el: El, e: Enemy): FoeSkill {
  const n = EL_NAME[el] || '妖';
  return Math.random() < 0.5
    ? S({ id: 'ult', name: `${n}灾·天降`, k: 'rain', n: 11, r: 105, tele: 1.2, pow: 2.2, range: 700, cd: 18, ult: true, status: EL_ST[el], pool: el === 'fire' || el === 'poison' ? 3 : 0 }, el === 'phys' ? 'earth' : el)
    : S({ id: 'ult', name: `${n}煞爆`, k: 'nova', r: 400, tele: 1.5, pow: 3.2, range: 400, cd: 18, ult: true, status: EL_ST[el] }, el === 'phys' ? 'earth' : el);
}

export function isBoss(e: Enemy) { return !!(e.boss || e.def.lair || e.blv >= 8); }

/** v0.56：模组给某种敌人定的招式（replace=true 只用模组的；否则接在游戏自动配的后面） */
export const MOD_KITS: Record<string, { skills: FoeSkill[]; replace: boolean }> = {};

export function kitOf(e: Enemy): FoeSkill[] {
  if (e.kit) return e.kit;
  const mk = MOD_KITS[e.def.id];
  if (mk?.replace) { e.kit = mk.skills.map((s) => ({ ...s })); return e.kit; }
  let kit: FoeSkill[];
  if (LAIR_KIT[e.def.id]) {
    kit = LAIR_KIT[e.def.id](e);
    // v0.60：原著妖王（多在八至十级）在专属招式之外，同样修成本命妖功
    if (e.def.kind !== 'human' && e.blv >= 4) kit.push(...beastArts(e, elOf(e), e.blv, kit));
  }
  else if (e.def.kind === 'human') kit = humanKit(e);
  else {
    const all = autoKit(e);
    const tier = e.blv || Math.max(1, e.realm * 2 - 1);
    const n = (tier <= 2 ? 3 : tier <= 4 ? 4 : 5) + (e.affix ? 1 : 0);
    // 先保留召唤/护体这类“一次性”招，其余按顺序取
    kit = all.slice(0, n);
    // 第三十五步：五级以上妖兽炼成妖丹神通——一记本命光柱 / 爆裂；七级另有本命大招
    const el = elOf(e), elN = EL_NAME[el] || '妖';
    if (tier >= 5 && !kit.some((s) => s.k === 'beam')) kit.push(S({ id: 'dan_beam', name: `妖丹·${elN}光`, k: 'beam', len: 720, w: 80, tele: 0.85, dur: 0.5, pow: 2.5, range: 680, min: 110, cd: 10, status: EL_ST[el] }, el === 'phys' ? 'earth' : el));
    // v0.60：四级以上妖兽各修一门本命妖功（六级添护体、八级添妖域），落招光效见 gl/beastgl.ts
    if (tier >= 4) kit.push(...beastArts(e, el, tier, kit));
    if (isBoss(e) || tier >= 7 || (e.affix && tier >= 4)) kit.push(ultFor(el, e));
  }
  // 见人就逃 / 不主动伤人的小兽不配招
  if (e.def.behave === 'flee' || e.def.behave === 'shy') kit = [];
  if (mk) kit = kit.concat(mk.skills.map((s) => ({ ...s })));
  e.kit = kit;
  return kit;
}

/** v0.64：修士起手——指间一点法诀灵光、脚下一圈本系光纹、几缕灵气上扬（大招更盛）。只在你附近才画。 */
function humanCastFx(c: Combat, e: Enemy, sk: FoeSkill) {
  const p = c.game.player;
  if (Math.abs(e.x - p.x) > 1500 || Math.abs(e.y - p.y) > 1100) return;
  const col = EL_COL[sk.el], lift = e.anim.flying ? 70 : 0, big = !!sk.ult;
  c.fxq.push({ k: 'cast', x: e.x, y: e.y - 62 - lift, color: col, power: big ? 1.15 : 0.55 });
  c.vfx.push({ kind: 'ring', x: e.x, y: e.y - lift, r: big ? 130 : 62, t: 0, dur: Math.min(0.9, Math.max(0.35, sk.tele)), color: col } as any);
  const n = big ? 12 : 5, r = big ? 72 : 36;
  for (let i = 0; i < n; i++) { const a = (i / n) * TAU + Math.random() * 0.6; c.sparks.push({ x: e.x + Math.cos(a) * r, y: e.y - lift + Math.sin(a) * r * 0.4, vx: -Math.cos(a) * 26, vy: -rand(60, 130), t: 0, max: rand(0.4, 0.8), size: big ? 6 : 4, color: col }); }
}
// ------------------------------------------------------------------ 运行
type Cast = { sk: FoeSkill; t: number; x0: number; y0: number; x1: number; y1: number; ang: number; hit: boolean; wave: number; hz?: Hz; dash?: number; grp?: { hit: boolean } };

export class FoeAI {
  c: Combat;
  hz: Hz[] = [];
  private pend: Hz[] = [];
  /** 大招结算后的全屏闪光（秒）与颜色 */
  ultFlash = 0; ultCol = '255,255,255';
  /** 当前蓄力中的大招进度（0 = 无），供全屏压暗 */
  ultCharge() { let u = 0; for (const h of this.hz) if (h.big && !h.fired) u = Math.max(u, h.t / h.tele); return u; }
  /** 第三十八步：正在蓄力的大招名与施放者（首领血条上显示「蓄力·招式名」） */
  ultName = ''; ultSrc: Enemy | null = null;
  private warnT = 0;
  constructor(c: Combat) { this.c = c; }
  reset() { this.hz = []; }

  /** 阶段狂暴：血量跌破 70% / 35% */
  phase(e: Enemy) {
    if (!isBoss(e) || e.dead) return;
    const k = e.hp / e.maxHp, want = k < 0.35 ? 2 : k < 0.7 ? 1 : 0;
    if (want <= e.rage) return;
    e.rage = want;
    const c = this.c, g = c.game;
    c.texts.push({ x: e.x, y: e.y - 150, s: want === 2 ? `${e.name}·狂暴！` : `${e.name}·暴怒！`, color: '#ff5a3a', source: e, t: 0, vy: -20, big: true });
    const known = preciseActorVisible(g, e);
    const nearbyDanger = Math.hypot(g.player.x - e.x, g.player.y - e.y) < 320;
    if (known || nearbyDanger) g.toast(known ? (want === 2 ? `${e.name}血气翻涌，彻底狂暴了——招式更快、更狠！` : `${e.name}被激怒了，周身${EL_NAME[elOf(e)] || '妖'}气暴涨！`) : '强敌气息暴涨，招式恐将更加凶猛！', 'warn');
    if (known || nearbyDanger) g.juice(0.08, 0.6);
    // 第三十八步：换阶段要有分量——镜头推近、时间一缓、短暂护体（蜕变的一息）
    if (known) g.cinema(e.x, e.y - 60, 1.14, 1.3); g.slowmo(0.35); e.guardT = Math.max(e.guardT, 1.0);
    c.vfx.push({ kind: 'ring', x: e.x, y: e.y, r: 320, t: 0, dur: 0.7, color: EL_COL[elOf(e)], fx: 'roar', source: e } as any);
    if (known) c.fxq.push({ k: 'kill', x: e.x, y: e.y - 60, color: EL_COL[elOf(e)] });
    // 震退
    const p = g.player, dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
    if (d < 320) { p.x += dx / d * 90; p.y += dy / d * 50; }
    // 立刻放大招
    const u = kitOf(e).find((s) => s.ult); if (u) e.skCd[u.id] = 0.6;
    e.skT = Math.min(e.skT, 0.8);
    if (known || nearbyDanger) audio.sfx('thunder');
  }

  private skMpCost(e: Enemy, sk: FoeSkill): number {
    if (e.def.kind !== 'human' || e.maxMp <= 0) return 0;
    const base = 10 + e.realm * 14;
    const mult = sk.ult ? 1.85 : sk.k === 'heal' || sk.k === 'guard' || sk.k === 'fury' ? 0.75 : Math.max(0.7, sk.pow * 0.58);
    return Math.min(Math.round(e.maxMp * 0.42), Math.max(8, Math.round(base * mult)));
  }

  /** 每帧：处于施法中则推进，返回 true 表示此敌人本帧由技能接管（不再走寻常 AI） */
  tick(e: Enemy, dt: number, tx: number, ty: number, dist: number): boolean {
    const kit = kitOf(e);
    if (!kit.length) return false;
    for (const k in e.skCd) e.skCd[k] -= dt * (1 + e.rage * 0.25);
    e.guardT = Math.max(0, e.guardT - dt);
    // v0.64：燃血 / 狂化——期间周身灵焰升腾，到点散功
    const E = e as any;
    if (E.furyT > 0) {
      E.furyT -= dt;
      if (Math.random() < dt * 10) this.c.sparks.push({ x: e.x + rand(-22, 22), y: e.y - rand(10, 70), vx: rand(-14, 14), vy: -rand(70, 140), t: 0, max: rand(0.35, 0.7), size: 5, color: E.furyCol ?? '255,120,60' });
      if (E.furyT <= 0) { e.atk /= E.furyK || 1; E.furyK = 0; }
    }
    if (e.cast) { this.run(e, e.cast, dt, tx, ty); return true; }
    if (e.medT > 0) return false;
    e.skT -= dt * (1 + e.rage * 0.35 + (E.furyT > 0 ? 0.3 : 0));
    if (e.skT > 0 || e.windup > 0) return false;
    const hpK = e.hp / e.maxHp;
    const wf = (e as any).warForm;
    const inWf = !!(wf && !wf.collapsed && wf.soldiers > 0);
    const inRange = kit.filter((s) => {
      if ((e.skCd[s.id] ?? 0) > 0) return false;
      if (inWf && (s.k === 'blink' || s.k === 'charge' || s.k === 'leap')) return false;
      const effR = inWf && s.range > 300 ? Math.max(s.range, 1050) : s.range;
      return dist <= effR && dist >= (s.min ?? 0) && (!s.hpBelow || hpK < s.hpBelow) && !(s.once && e.used?.[s.id]) && !(s.k === 'ying' && (e as any).ying);
    });
    if (!inRange.length) { e.skT = 0.4; return false; }
    const ready = inRange.filter((s) => this.skMpCost(e, s) <= e.mp);
    if (!ready.length) {
      e.medT = Math.max(e.medT, 2.2);
      e.skT = 1.6;
      if (e.def.kind === 'human') this.c.texts.push({ x: e.x, y: e.y - 110, s: '法力不足·调息', color: '#9ed4ff', source: e, t: 0, vy: -22 });
      return false;
    }
    // 大招优先；其余按“效用”打分（第三十五步）：距离合适、趁你被控时上重招、挨打时护体、残血时回春 / 遁走、不老用同一招
    const sk = ready.find((s) => s.ult) ?? this.choose(e, ready, dist, hpK);
    e.lastSk = sk.id;
    this.start(e, sk, tx, ty);
    return true;
  }

  private choose(e: Enemy, ready: FoeSkill[], dist: number, hpK: number): FoeSkill {
    const c = this.c, pst = c.pst, ctl = !!(pst.stun || pst.root || pst.freeze), slowed = !!pst.slow;
    const hurtRecently = c.game.time - e.lastHitBy < 1.5;
    let mine = 0; for (const o of c.enemies) if (!o.dead && o.minion) mine++;
    let best = ready[0], bs = -1;
    for (const s of ready) {
      let w = 1;
      const melee = s.range <= 300;
      if (melee) w *= dist < s.range * 0.85 ? 1.6 : 0.6; else w *= dist > 220 ? 1.2 : 0.7;
      const heavy = s.k === 'rain' || s.k === 'beam' || s.k === 'leap' || s.k === 'charge' || s.k === 'nova' || s.k === 'circle' || s.k === 'lines' || s.k === 'march' || s.k === 'track';
      if ((ctl || slowed) && heavy) w *= 1 + s.pow * (ctl ? 0.9 : 0.4);   // 连招：定住你就上重手
      const hard = s.status && (s.status.k === 'stun' || s.status.k === 'root' || s.status.k === 'freeze');
      if (hard && !ctl) w *= 1.6;
      if (hard && ctl) w *= 0.4;
      if (s.k === 'guard') w *= hurtRecently ? 2.2 : 0.3;
      if (s.k === 'heal') w *= hpK < 0.5 ? 3 : 0.2;
      if (s.k === 'summon') w *= mine < 2 ? 1.6 : 0.3;
      if (s.k === 'blink') w *= dist > 480 || (hpK < 0.4 && dist < 220) ? 2.2 : 0.6;
      // v0.64 新式的取舍：挨了打 / 血不多才燃血；血少时偏爱吸取；离得远才摄引、贴得近才震退
      if (s.k === 'fury') w *= (e as any).furyT > 0 ? 0 : hurtRecently || hpK < 0.6 ? 2 : 0.8;
      if (s.leech) w *= hpK < 0.65 ? 2 : 0.9;
      if (s.pull) w *= s.pull > 0 ? (dist > 300 ? 1.7 : 0.4) : (dist < 210 ? 1.8 : 0.5);
      if (e.sup >= 2 && (s.k === 'blink' || s.k === 'charge' || s.k === 'leap')) w = 0;   // 第四十一步：被镇压，冲不动也跃不起
      if (s.id === e.lastSk) w *= 0.35;
      w *= 0.6 + Math.random() * 0.8;
      if (w > bs) { bs = w; best = s; }
    }
    return best;
  }
  private start(e: Enemy, sk: FoeSkill, tx: number, ty: number) {
    const c = this.c, g = c.game;
    const mpCost = this.skMpCost(e, sk);
    if (mpCost > 0) e.mp = Math.max(0, e.mp - mpCost);
    e.skCd[sk.id] = Math.max(sk.cd, e.def.kind === 'human' ? 6.5 : sk.cd) * rand(0.95, 1.2);
    e.skT = (isBoss(e) ? 2.2 : e.def.kind === 'human' ? 2.85 : 2.65) * rand(0.9, 1.25) * (e.realm >= 4 ? 0.85 : 1);   // 保留明确施法后摇/冷却节奏，杜绝连珠轰炸
    if (sk.once) (e.used ??= {})[sk.id] = true;
    const ang = Math.atan2(ty - e.y, tx - e.x);
    const cast: Cast = { sk, t: 0, x0: e.x, y0: e.y, x1: tx, y1: ty, ang, hit: false, wave: 0 };
    e.cast = cast; e.facing = tx > e.x ? 1 : -1;
    e.anim.atk = 0.3;
    c.texts.push({ x: e.x, y: e.y - (e.def.kind === 'human' ? 135 : 120), s: sk.name, color: sk.ult ? '#ffcf5a' : '#ffb08a', source: e, t: 0, vy: -18, big: !!sk.ult });
    if (sk.ult) { g.juice(0.02, 0.25); g.toast(preciseActorVisible(g, e) ? `${e.name}施展「${sk.name}」！` : '强敌正在施展强力招式，小心闪避！', 'warn'); this.ultName = sk.name; this.ultSrc = e; }
    const dmg = e.atk * sk.pow * (1 + e.rage * 0.15);
    const cj = {};   // v0.70：问道残卷——这一次出手看见 / 挨上 / 躲开各记一次
    g.canjuan?.onCast(e, sk, cj);
    const base = { t: 0, tele: sk.tele, dur: 0, el: sk.el, dmg, realm: e.realm, status: sk.status, src: e, fired: false, tick: 0, pool: sk.pool, big: !!sk.ult, spread: 0, len: 0, w: 0, ang: 0, r: 0, pfx: sk.pfx, leech: sk.leech, pull: sk.pull, sid: sk.id, cj };
    if (e.def.kind === 'human') humanCastFx(c, e, sk);   // v0.64：修士起手灵光
    beastCastFx(e, sk);   // v0.60：四级以上妖兽起手时脚下亮法阵
    const n0 = this.hz.length;
    this.place(e, sk, cast, base, tx, ty, ang);
    // v0.54.2：化形 / 出窍——现出法相（只是画面；伤害照旧走上面的预警）
    if (sk.hx || sk.k === 'ying') g.shen?.foeCast(e, sk, this.hz.slice(n0), tx, ty);
  }
  private place(e: Enemy, sk: FoeSkill, cast: Cast, base: Omit<Hz, 'k' | 'x' | 'y'>, tx: number, ty: number, ang: number) {
    const g = this.c.game;
    switch (sk.k) {
      case 'circle': { const lead = 0.35 + (e.def.kind === 'human' || e.blv >= 4 ? 0.35 : 0); const p = g.player; const vx = e.tgE ? e.tgE.mvx : e.tgP ? p.st?.vx ?? 0 : 0, vy = e.tgE ? e.tgE.mvy : e.tgP ? p.st?.vy ?? 0 : 0; this.add({ ...base, k: 'circle', x: tx + vx * lead * 0.5, y: ty + vy * lead * 0.5, r: sk.r! }); break; }
      case 'rain': {
        const n = sk.n! + e.rage * 2;
        for (let i = 0; i < n; i++) {
          const a = Math.random() * TAU, rr = i === 0 ? 0 : rand(60, 260 + (sk.ult ? 140 : 0));
          this.add({ ...base, k: 'circle', x: tx + Math.cos(a) * rr, y: ty + Math.sin(a) * rr * 0.7, r: sk.r! * rand(0.85, 1.15), tele: sk.tele + i * 0.12, big: false, pool: sk.pool && i % 2 === 0 ? sk.pool : 0 });
        }
        break;
      }
      case 'cone': cast.hz = this.add({ ...base, k: 'cone', x: e.x, y: e.y, r: sk.r!, spread: sk.spread!, ang }); break;
      case 'nova': case 'roar': cast.hz = this.add({ ...base, k: 'circle', x: e.x, y: e.y, r: sk.r! }); break;
      case 'beam': cast.hz = this.add({ ...base, k: 'line', x: e.x, y: e.y - 20, ang, len: sk.len!, w: sk.w!, dur: sk.dur ?? 0.5 }); break;
      case 'leap': {
        const T = g.terrain, ok = (x: number, y: number) => e.def.flying || (e.sea ? !T.isLand(x, y) : T.walkFactor(x, y) > 0);
        let d = Math.min(Math.hypot(tx - e.x, ty - e.y), sk.range);
        while (d > 40 && !ok(e.x + Math.cos(ang) * d, e.y + Math.sin(ang) * d)) d -= 40;
        cast.x1 = e.x + Math.cos(ang) * d; cast.y1 = e.y + Math.sin(ang) * d; cast.hz = this.add({ ...base, k: 'circle', x: cast.x1, y: cast.y1, r: sk.r! }); break; }
      case 'charge': { const L = sk.len!; cast.x1 = e.x + Math.cos(ang) * L; cast.y1 = e.y + Math.sin(ang) * L; cast.hz = this.add({ ...base, k: 'line', x: e.x, y: e.y, ang, len: L, w: sk.w!, dmg: 0 }); cast.hz.vis = true; break; }
      // ---------- v0.64 新式 ----------
      case 'lines': {   // 数道光柱扇形齐出（一轮至多中一道）
        const n = Math.max(2, sk.n ?? 3), sp = sk.spread ?? 0.7, grp = { hit: false };
        cast.grp = grp;
        for (let i = 0; i < n; i++) {
          const h = this.add({ ...base, k: 'line', x: e.x, y: e.y - 20, ang: ang + (i / (n - 1) - 0.5) * sp, len: sk.len!, w: sk.w!, dur: sk.dur ?? 0.28, big: base.big && i === 0, grp });
          if (i === (n >> 1)) cast.hz = h;
        }
        break;
      }
      case 'march': {   // 一路炸过去：自身前起逐个向对手推进（一轮至多中一记）
        const n = sk.n ?? 5, r = sk.r ?? 78, grp = { hit: false };
        const reach = Math.min(sk.range, Math.hypot(tx - e.x, ty - e.y) + r * 1.6), step = Math.max(r * 1.1, (reach - r) / Math.max(1, n - 1));
        for (let i = 0; i < n; i++) { const d = r + step * i; this.add({ ...base, k: 'circle', x: e.x + Math.cos(ang) * d, y: e.y + Math.sin(ang) * d, r, tele: sk.tele + i * (sk.gapT ?? 0.13), big: false, pool: sk.pool && i === n - 1 ? sk.pool : 0, grp }); }
        break;
      }
      default: break;
    }
  }

  private add(h: Hz) { this.hz.push(h); return h; }
  /** 第三十二步：土遁伏击等“非招式”的地面预警 */
  zone(e: Enemy, x: number, y: number, r: number, el: El, pow: number, tele: number, status?: StatusSpec) {
    return this.add({ k: 'circle', x, y, r, t: 0, tele, dur: 0, el, dmg: e.atk * pow, realm: e.realm, status, src: e, fired: false, tick: 0, spread: 0, len: 0, w: 0, ang: 0 });
  }

  private run(e: Enemy, cs: Cast, dt: number, tx: number, ty: number) {
    const c = this.c, g = c.game, sk = cs.sk, T = g.terrain;
    cs.t += dt;
    const u = cs.t / sk.tele;
    e.anim.atk = Math.min(1, 0.3 + u * 0.7);
    if (e.st.freeze || e.st.stun) { this.interrupt(e); return; }
    switch (sk.k) {
      case 'salvo': case 'ring': {
        if (cs.t < sk.tele) return;
        const waves = sk.waves ?? 1, gap = sk.k === 'ring' ? 0.32 : 0.16;
        while (cs.wave < waves && cs.t >= sk.tele + cs.wave * gap) { this.fireWave(e, sk, cs, tx, ty); cs.wave++; }
        if (cs.wave >= waves) this.end(e);
        return;
      }
      case 'leap': {
        const crouch = 0.35;
        if (u < crouch) return;
        if (e.sup >= 2) { e.lift = 0; this.end(e); return; }
        const k = Math.min(1, (u - crouch) / (1 - crouch));
        e.x = cs.x0 + (cs.x1 - cs.x0) * k; e.y = cs.y0 + (cs.y1 - cs.y0) * k;
        e.lift = Math.sin(k * Math.PI) * (140 + (sk.r ?? 100) * 0.4);
        if (u >= 1) { e.lift = 0; this.end(e); }
        return;
      }
      case 'charge': {
        if (u < 1) return;
        cs.dash = (cs.dash ?? 0) + dt;
        const spd = 1500, L = sk.len!, k = Math.min(1, cs.dash * spd / L);
        const px = e.x, py = e.y, nx = cs.x0 + (cs.x1 - cs.x0) * k, ny = cs.y0 + (cs.y1 - cs.y0) * k;
        const okMove = e.def.flying || (e.sea ? !T.isLand(nx, ny) : T.walkFactor(nx, ny) > 0);
        if (okMove && e.sup < 2) { e.x = nx; e.y = ny; }
        if (Math.random() < 0.8) c.sparks.push({ x: px, y: e.y - 20, vx: -Math.cos(cs.ang) * 120, vy: -40, t: 0, max: 0.4, size: 5, color: EL_COL[sk.el] });
        const p = g.player;
        // 第三十九步：冲撞也会撞上别派的人
        if (!cs.hit) { const o = c.rivalNear(e, e.x, e.y, 70 + (sk.w ?? 80) * 0.3); if (o) { cs.hit = true; c.npcHit(e, o, e.atk * sk.pow * (1 + e.rage * 0.15), e.realm, sk.status, e.x, e.y); c.fxq.push({ k: 'hit', x: o.x, y: o.y - 50, color: EL_COL[sk.el], power: 1.6, dir: cs.ang }); } }
        if (!cs.hit && !e.ally) for (const t of c.tanks) if (t.k !== 'p' && t.k !== 'decoy' && Math.hypot(t.x - e.x, t.y - e.y) < 70 + (sk.w ?? 80) * 0.3) { cs.hit = true; c.tankHit(t, e.atk * sk.pow * (1 + e.rage * 0.15), e.realm, sk.status, e.x, e.y); break; }
        if (!cs.hit && !e.ally && Math.hypot(p.x - e.x, p.y - e.y) < 70 + (sk.w ?? 80) * 0.3) {
          cs.hit = true;
          c.hitPlayer(e.atk * sk.pow * (1 + e.rage * 0.15), e.realm, sk.status, e.x, e.y, e);
          const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1; p.x += dx / d * 70 + Math.cos(cs.ang) * 40; p.y += dy / d * 40;
          g.juice(0.05, 0.4);
          c.fxq.push({ k: 'hit', x: p.x, y: p.y - 50, color: EL_COL[sk.el], power: 2, dir: cs.ang });
        }
        if (k >= 1 || !okMove) { void py; if (cs.hz) cs.hz.t = 99; this.end(e); c.vfx.push({ kind: 'ring', x: e.x, y: e.y, r: 110, t: 0, dur: 0.4, color: EL_COL[sk.el], fx: 'rock' } as any); }
        return;
      }
      case 'blink': {
        if (cs.t < sk.tele) return;
        if (e.sup >= 2) { this.end(e); return; }
        const p = e.tgE && !e.tgE.dead ? e.tgE : e.ally ? { x: cs.x1, y: cs.y1 } : g.player, a = Math.random() * TAU;   // 第三十九步：闪到自己的对手身边
        c.vfx.push({ kind: 'blinkfx', x: e.x, y: e.y, r: 70, t: 0, dur: 0.45, color: EL_COL[sk.el] } as any);
        const nx = p.x + Math.cos(a) * 110, ny = p.y + Math.sin(a) * 70;
        if (e.def.flying || (e.sea ? !T.isLand(nx, ny) : T.walkFactor(nx, ny) > 0)) { e.x = nx; e.y = ny; }
        c.vfx.push({ kind: 'blinkfx', x: e.x, y: e.y, r: 70, t: 0, dur: 0.45, color: EL_COL[sk.el] } as any);
        // 现身即一爪
        const ang = Math.atan2(p.y - e.y, p.x - e.x);
        this.add({ k: 'cone', x: e.x, y: e.y, r: 190, spread: 0.8, ang, t: 0, tele: 0.42, dur: 0, el: sk.el, dmg: e.atk * sk.pow, realm: e.realm, status: sk.status, src: e, fired: false, tick: 0, len: 0, w: 0 });
        e.skT = Math.max(e.skT, 1); this.end(e); e.cast = { sk: { ...sk, k: 'nova', tele: 0.42 }, t: 0, x0: e.x, y0: e.y, x1: e.x, y1: e.y, ang, hit: false, wave: 0 } as any;
        return;
      }
      case 'summon': {
        if (cs.t < sk.tele) return;
        const def = ENEMIES[sk.minion!] ?? e.def, n = sk.n ?? 2;
        let made = 0;
        for (let i = 0; i < n; i++) {
          if (c.enemies.filter((o) => !o.dead).length >= 14) break;
          const a = (i / n) * TAU + Math.random(), x = e.x + Math.cos(a) * 120, y = e.y + Math.sin(a) * 80;
          if (!def.flying && (e.sea ? T.isLand(x, y) : T.walkFactor(x, y) <= 0)) continue;
          const m = c.makeMinion(def, x, y, e);
          c.vfx.push({ kind: 'blinkfx', x, y, r: 60, t: 0, dur: 0.5, color: EL_COL[sk.el] } as any);
          if (m) made++;
        }
        if (made) c.texts.push({ x: e.x, y: e.y - 150, s: `援兵 ×${made}`, color: '#ffb080', source: e, t: 0, vy: -24 });
        this.end(e); return;
      }
      // ---------- v0.64 新式 ----------
      case 'track': {   // 连环追击：每隔一息，在对手此刻的落脚处再落一记
        const t0 = sk.tele * 0.5, waves = sk.waves ?? 3, gap = sk.gapT ?? 0.55;
        if (cs.t < t0) return;
        while (cs.wave < waves && cs.t >= t0 + cs.wave * gap) {
          this.add({ k: 'circle', x: tx + rand(-14, 14), y: ty + rand(-9, 9), r: sk.r ?? 88, t: 0, tele: Math.max(0.45, sk.tele * 0.75), dur: 0, el: sk.el, dmg: e.atk * sk.pow * (1 + e.rage * 0.15), realm: e.realm, status: sk.status, src: e, fired: false, tick: 0, spread: 0, len: 0, w: 0, ang: 0, pool: sk.pool && cs.wave === waves - 1 ? sk.pool : 0, pfx: sk.pfx, leech: sk.leech, pull: sk.pull });
          cs.wave++;
        }
        if (cs.wave >= waves) this.end(e);
        return;
      }
      case 'spiral': {   // 旋转弹幕：数臂弹幕边转边射
        if (cs.t < sk.tele) return;
        const waves = sk.waves ?? 9, gap = sk.gapT ?? 0.1;
        while (cs.wave < waves && cs.t >= sk.tele + cs.wave * gap) { this.fireWave(e, sk, cs, tx, ty); cs.wave++; }
        if (cs.wave >= waves) this.end(e);
        return;
      }
      case 'fury': {   // 燃血 / 狂化：一段时间内出手更重、出招更勤
        if (cs.t < sk.tele) return;
        const E = e as any, k = Math.max(1.05, sk.pow || 1.3), col = EL_COL[sk.el];
        if (!(E.furyT > 0)) { E.furyK = k; e.atk *= k; }
        E.furyT = sk.dur ?? 8; E.furyCol = col;
        c.vfx.push({ kind: 'aura', x: e.x, y: e.y, r: 90, t: 0, dur: 0.7, color: col, fx: 'gold' } as any);
        c.vfx.push({ kind: 'ring', x: e.x, y: e.y, r: 210, t: 0, dur: 0.5, color: col, fx: 'roar' } as any);
        c.fxq.push({ k: 'cast', x: e.x, y: e.y - 60, color: col, power: 1.1 });
        for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU; c.sparks.push({ x: e.x + Math.cos(a) * 30, y: e.y - 20 + Math.sin(a) * 12, vx: Math.cos(a) * 150, vy: Math.sin(a) * 60 - 70, t: 0, max: 0.6, size: 6, color: col }); }
        this.end(e); return;
      }
      case 'ying': {
        if (cs.t < sk.tele) return;
        c.game.shen?.foeOut(e);
        this.end(e); return;
      }
      case 'guard': {
        if (cs.t < sk.tele) return;
        e.guardT = sk.dur ?? 4;
        c.vfx.push({ kind: 'aura', x: e.x, y: e.y, r: 80, t: 0, dur: 0.6, color: EL_COL[sk.el], fx: 'gold' } as any);
        this.end(e); return;
      }
      case 'heal': {
        if (cs.t < sk.tele) return;
        e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.3);
        c.vfx.push({ kind: 'aura', x: e.x, y: e.y, r: 70, t: 0, dur: 0.7, color: '140,230,120', fx: 'leaf' } as any);
        c.texts.push({ x: e.x, y: e.y - 120, s: '+' + Math.round(e.maxHp * 0.3), color: '#8fe08a', source: e, t: 0, vy: -40 });
        this.end(e); return;
      }
      default: {
        // circle / rain：出完手即可走动；cone / nova / beam：须站定到结算
        const hold = sk.k === 'cone' || sk.k === 'nova' || sk.k === 'roar' || sk.k === 'beam' || sk.k === 'lines';
        const end = hold ? sk.tele + (sk.k === 'beam' || sk.k === 'lines' ? (sk.dur ?? 0.5) : 0.15) : 0.45;
        if (cs.t >= end) this.end(e);
        return;
      }
    }
  }

  /** 被冻住 / 定身：打断施法，未结算的预警作废 */
  interrupt(e: Enemy) {
    const cs = e.cast as Cast | null; if (!cs) return;
    if (cs.hz && !cs.hz.fired) { cs.hz.dmg = 0; cs.hz.t = 99; }
    if (cs.grp) for (const h of this.hz) if (h.grp === cs.grp && !h.fired && h.k === 'line') { h.dmg = 0; h.t = 99; }   // v0.64：齐发的光柱一并作废
    this.end(e);
    this.c.texts.push({ x: e.x, y: e.y - 120, s: '打断！', color: '#bfe0ff', source: e, t: 0, vy: -30 });
  }

  private end(e: Enemy) { e.cast = null; e.lift = 0; e.anim.atk = 0; }

  private fireWave(e: Enemy, sk: FoeSkill, cs: Cast, tx: number, ty: number) {
    const c = this.c, fx = EL_PROJ[sk.el], col = EL_COL[sk.el];
    const sy = e.y - (e.anim.flying ? 70 : 40);
    const dmg = e.atk * sk.pow * (1 + e.rage * 0.15);
    const wf = (e as any).warForm;
    const effR = wf && !wf.collapsed && wf.soldiers > 0 && sk.range > 300 ? Math.max(sk.range, 1050) : sk.range;
    const push = (ang: number, spd: number) => c.projs.push({ fac: 'e', x: e.x, y: sy, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, life: 0, max: effR / spd + 0.3, fx, color: col, dmg, realm: e.realm, status: sk.status ?? EL_ST[sk.el], stCh: (sk.status ?? EL_ST[sk.el])?.ch ?? 0, pierce: false, homing: false, hit: new Set(), r: 24, aoe: 0, size: sk.ult ? 1.3 : 1, trail: [], lv: 0, src: e, ally: e.ally } as any);
    if (sk.k === 'ring') {
      const n = sk.n! + e.rage * 4, off = cs.wave * (Math.PI / n);
      for (let i = 0; i < n; i++) push(off + (i / n) * TAU, 340);
    } else if (sk.k === 'spiral') {   // v0.64：数臂弹幕，每一波转过一个角度
      const arms = Math.max(2, sk.n ?? 3), off = cs.ang + cs.wave * (sk.spread ?? 0.42);
      for (let i = 0; i < arms; i++) push(off + (i / arms) * TAU, 300);
    } else {
      const n = sk.n!, aim = Math.atan2(ty - 40 - sy, tx - e.x) + (cs.wave % 2 ? 0.06 : -0.06);
      for (let i = 0; i < n; i++) push(aim + (n > 1 ? (i / (n - 1) - 0.5) * sk.spread! : 0), 560);
    }
  }

  /** 预警结算、持续区域伤害 */
  update(dt: number) {
    const c = this.c, g = c.game, p = g.player;
    this.pend = [];
    this.warnT -= dt;
    if (this.ultSrc && (this.ultSrc.dead || !this.hz.some((h) => h.big && !h.fired))) { if (!this.ultSrc.cast || this.ultSrc.dead) { this.ultSrc = null; this.ultName = ''; } }
    this.hz = this.hz.filter((h) => {
      h.t += dt;
      // 发招者死了：未结算的预警作废
      if (!h.fired && h.src?.dead) return false;
      if (h.k === 'cone' && !h.fired && h.src && !h.src.dead) { h.x = h.src.x; h.y = h.src.y; }
      // 第三十八步：站在要落下的招式里 → 头顶「避！」+ 钟声（每 0.7 秒最多一次）
      const ally = !!h.src?.ally;   // 第三十九步：同阵修士的招式不伤你、不给你报警
      if (!ally && !h.fired && !h.wasIn && h.cj && h.dmg > 0 && h.t > h.tele * 0.3 && this.inside(h, p.x, p.y)) h.wasIn = true;
      if (!ally && !h.fired && !h.warned && h.dmg > 0 && h.t > h.tele * 0.4 && this.warnT <= 0 && this.inside(h, p.x, p.y)) {
        h.warned = true; this.warnT = 0.7;
        c.texts.push({ x: p.x, y: p.y - 150, s: h.big ? '大招！快避！' : '避！', color: h.big ? '#ff4a3a' : '#ff8a5a', t: 0, vy: -30, big: true });
        audio.sfx('bell');
      }
      if (!h.fired && h.t >= h.tele) {
        h.fired = true;
        if (h.dmg > 0) {
          const inNow = !ally && !h.grp?.hit && this.inside(h, p.x, p.y);
          const dodged = (c as any).invulnT > 0 || !!(c as any).dash?.invuln;
          if (inNow) { c.hitPlayer(h.dmg, h.realm, h.status, h.x, h.y, h.src); h.hitDone = true; if (h.grp) h.grp.hit = true; if (!dodged && (h.leech || h.pull)) this.onHit(h); }
          // v0.70：问道残卷——挨上一记 / 躲开一记
          if (!ally && h.cj) { if (inNow && !dodged) g.canjuan?.onHit(h.src, h.sid, h.cj); else if (h.wasIn && (!inNow || dodged)) g.canjuan?.onDodge(h.src, h.sid, h.cj); }
          if (!ally) for (const t of c.tanks) if (t.k !== 'p' && t.k !== 'decoy' && this.inside(h, t.x, t.y)) c.tankHit(t, h.dmg, h.realm, h.status, h.x, h.y);
          this.splash(h, 1);
          this.boom(h);
        }
      }
      // 光柱：持续时间内反复判定
      if (h.fired && h.k === 'line' && h.dur > 0 && h.dmg > 0 && h.t < h.tele + h.dur) {
        h.tick -= dt;
        if (h.tick <= 0) { h.tick = 0.25; if (!ally && !h.hitDone && !h.grp?.hit && this.inside(h, p.x, p.y)) { c.hitPlayer(h.dmg * 0.5, h.realm, h.status, h.x, h.y, h.src); h.hitDone = true; if (h.grp) h.grp.hit = true; } this.splash(h, 0.25); }
      }
      // 余毒 / 余火：留在地上的区域
      if (h.fired && h.pool && h.dmg > 0 && h.k === 'circle') {
        h.pooling = true;
        h.tick -= dt;
        if (h.tick <= 0) { h.tick = 0.5; if (!ally && this.inside(h, p.x, p.y)) c.hitPlayer(h.dmg * 0.18, h.realm, h.status, h.x, h.y, h.src); if (!ally) for (const t of c.tanks) if (t.k !== 'p' && t.k !== 'decoy' && this.inside(h, t.x, t.y)) c.tankHit(t, h.dmg * 0.18, h.realm, h.status, h.x, h.y); this.splash(h, 0.18); }
        return h.t < h.tele + h.pool;
      }
      return h.t < h.tele + Math.max(0.35, h.k === 'line' ? h.dur + 0.2 : 0.35);
    });
    if (this.pend.length) { this.hz.push(...this.pend); this.pend = []; }
    this.ultFlash = Math.max(0, this.ultFlash - dt);
  }

  /** v0.64：命中你之后的附带效果——吸取（按自身气血上限回补，一缕血气自你身上流向他）、摄引 / 震退（把你拖近或推开） */
  private onHit(h: Hz) {
    const c = this.c, g = c.game, p = g.player, s = h.src;
    if (!s || s.dead) return;
    const col = EL_COL[h.el];
    if (h.leech) {
      const heal = Math.min(s.maxHp - s.hp, Math.max(1, Math.round(s.maxHp * h.leech)));
      if (heal > 0) { s.hp += heal; c.texts.push({ x: s.x, y: s.y - 125, s: '吸取 +' + heal, color: '#ff8a9a', t: 0, vy: -36 }); }
      for (let i = 0; i < 9; i++) { const k = i / 9; c.sparks.push({ x: p.x + (s.x - p.x) * k + rand(-10, 10), y: p.y - 50 + (s.y - p.y) * k + rand(-10, 10), vx: (s.x - p.x) * 0.9, vy: (s.y - p.y) * 0.9 - 20, t: 0, max: 0.5, size: 5, color: col }); }
      c.vfx.push({ kind: 'aura', x: s.x, y: s.y, r: 70, t: 0, dur: 0.5, color: col, fx: 'gold' } as any);
    }
    if (h.pull) {
      const dx = s.x - p.x, dy = s.y - p.y, d = Math.hypot(dx, dy) || 1;
      const m = h.pull > 0 ? Math.min(h.pull, Math.max(0, d - 90)) : h.pull;   // 摄引至多拖到他跟前，不会拖过头
      const nx = p.x + dx / d * m, ny = p.y + dy / d * m;
      if ((p.st?.lift ?? 0) > 0 || g.terrain.walkFactor(nx, ny) > 0) { p.x = nx; p.y = ny; }
      c.texts.push({ x: p.x, y: p.y - 130, s: h.pull > 0 ? '摄！' : '震退！', color: '#ffd0a0', t: 0, vy: -26 });
      c.vfx.push({ kind: 'ring', x: p.x, y: p.y, r: 80, t: 0, dur: 0.35, color: col } as any);
    }
  }
  /** 第三十九步：招式落下时，圈里与发招者敌对的 NPC 一并挨打（混战里的误伤 / 群殴） */
  private splash(h: Hz, k: number) {
    const c = this.c, src = h.src; if (!src) return;
    for (const o of c.units) if (c.hostile(src, o) && this.inside(h, o.x, o.y)) c.npcHit(src, o, h.dmg * k, h.realm, h.status, h.x, h.y);
  }
  inside(h: Hz, x: number, y: number) {
    if (h.k === 'circle') { const dx = (x - h.x) / h.r, dy = (y - h.y) / (h.r * 0.55); return dx * dx + dy * dy < 1; }
    if (h.k === 'cone') {
      const dx = x - h.x, dy = (y - h.y) / 0.7, d = Math.hypot(dx, dy); if (d > h.r + 20) return false;
      let da = Math.atan2(dy, dx) - Math.atan2(Math.sin(h.ang) / 0.7, Math.cos(h.ang)); while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
      return Math.abs(da) < h.spread || d < 40;
    }
    const ux = Math.cos(h.ang), uy = Math.sin(h.ang), dx = x - h.x, dy = y - 20 - h.y;
    const along = dx * ux + dy * uy, perp = Math.abs(-dx * uy + dy * ux);
    return along > -30 && along < h.len && perp < h.w / 2 + 18;
  }

  /** 结算瞬间的爆开：复用法术光效 + 震屏 */
  private boom(h: Hz) {
    beastBoomFx(h);   // v0.60：四级以上妖兽的招式落地另有专属光效（v0.63：WebGL）
    const c = this.c, g = c.game, col = EL_COL[h.el], fx = EL_BOOM[h.el];
    const p = g.player, near = Math.hypot(p.x - h.x, p.y - h.y) < 700;
    if (h.k === 'circle') {
      if (h.el === 'thunder' || h.el === 'gold') c.vfx.push({ kind: 'strike', x: h.x, y: h.y, r: h.r, t: 0, dur: 0.5, color: col, fx: h.el === 'gold' ? 'goldthunder' : 'lightning', seed: Math.random() * 100 } as any);
      else if (h.el === 'fire' || h.el === 'blood') c.vfx.push({ kind: 'strike', x: h.x, y: h.y, r: h.r, t: 0, dur: 0.55, color: col, fx: 'flame', seed: Math.random() * 100 } as any);
      else if (h.el === 'ice') c.vfx.push({ kind: 'strike', x: h.x, y: h.y, r: h.r, t: 0, dur: 0.7, color: col, fx: 'frost', seed: Math.random() * 100 } as any);
      else if (h.el === 'earth' || h.el === 'phys') c.vfx.push({ kind: 'strike', x: h.x, y: h.y, r: h.r, t: 0, dur: 0.7, color: col, fx: 'rock', seed: Math.random() * 100 } as any);
      c.vfx.push({ kind: 'ring', x: h.x, y: h.y, r: h.r * 1.1, t: 0, dur: 0.45, color: col, fx } as any);
      c.vfx.push({ kind: 'flash', x: h.x, y: h.y - 30, r: h.r * 0.8, t: 0, dur: 0.35, color: col, fx, seed: Math.random() * 6 } as any);
      if (h.el === 'thunder' || h.el === 'gold') audio.sfx('thunder'); else if (h.big || h.r > 150) audio.sfx('boom');
    } else if (h.k === 'cone') {
      c.vfx.push({ kind: 'cone', x: h.x, y: h.y - 30, r: h.r, ang: h.ang, spread: h.spread, t: 0, dur: 0.45, color: col, fx: h.el === 'fire' ? 'flame' : h.el === 'sword' || h.el === 'phys' ? 'sword' : fx } as any);
      if (h.pool) for (let i = 0; i < 3; i++) { const a = h.ang + (i - 1) * h.spread * 0.6, d = h.r * 0.6; this.pend.push({ ...h, k: 'circle', x: h.x + Math.cos(a) * d, y: h.y + Math.sin(a) * d * 0.7, r: h.r * 0.28, t: h.tele, fired: true, tick: 0.3, pool: h.pool, dmg: h.dmg }); }
    } else {
      c.vfx.push({ kind: 'beam', x: h.x, y: h.y - 20, x2: h.x + Math.cos(h.ang) * h.len, y2: h.y - 20 + Math.sin(h.ang) * h.len, r: h.w * 0.5, t: 0, dur: Math.max(0.35, h.dur + 0.15), color: col, fx: h.el === 'thunder' ? 'lightning' : h.el === 'gold' ? 'goldthunder' : h.el === 'earth' ? 'rock' : fx, seed: Math.random() * 100 } as any);
      audio.sfx(h.big ? 'boom' : 'whoosh');
    }
    // v0.64：修士的招式落地——地上再炸开一圈本系灵光
    if (near && h.k === 'circle' && h.src?.def.kind === 'human') c.fxq.push({ k: 'impact', x: h.x, y: h.y, color: col, power: h.big ? 2.2 : h.r > 130 ? 1.4 : 1 });
    if (near) g.juice(h.big ? 0.06 : 0.015, h.big ? 0.55 : Math.min(0.3, 0.08 + h.r / 900));
    if (h.big) { (c as any).fxShock = { x: h.x, y: h.y, r: Math.max(h.r, h.len) * 1.4 }; this.ultFlash = 0.35; this.ultCol = col; if (near) g.slowmo(0.4); }
  }
}
