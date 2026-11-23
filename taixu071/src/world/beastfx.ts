// v0.60：四至十级妖兽加强 —— 身法（移速）、妖功（按五行各修一门本命妖术）
// v0.63：再加强 —— 气血 / 妖力 / 皮甲随级别递增（beastBuff），多添「妖息」「妖踏」「妖罡」三式；
//        原先那套像素特效整个拿掉：起手 / 落招 / 周身妖气改由 gl/beastgl.ts 用 WebGL 粒子来画，
//        这里只负责把「该放什么特效」排进队列（逻辑层不碰绘制）。
//
// 原先妖兽的移速是写死的一个数：一级苍狼 150，七级妖王也是 150——而结丹修士遁速 440、元婴 610，高阶妖兽根本追不上人。
// 现在四级以上按「同境界修士遁速」定下限，离得远时还会疾行；并且每只都按五行修成一门妖功。
import type { Enemy } from './combat';
import type { FoeSkill, SkKind, El, Hz } from './foeskills';
import type { StatusSpec } from '../data/arts';

/** 五行 → 圆形招式落地时的形态（gl/beastgl.ts 按五行选画法，这个键只作标记） */
export const CIRCLE_FX: Record<El, string> = {
  phys: 'slam', fire: 'pillar', ice: 'icicle', water: 'geyser', thunder: 'bolt', poison: 'acid',
  blood: 'darkboom', ghost: 'hands', wind: 'tornado', earth: 'spike', sword: 'mana', gold: 'bolt', metal: 'mana',
};

// ------------------------------------------------------------------ 特效事件（由 gl/beastgl.ts 每帧取走）
export interface BeastEv {
  k: 'cast' | 'boom' | 'dust' | 'seal';
  x: number; y: number; el: El; lv: number; r: number;
  shape?: 'circle' | 'cone' | 'line'; ang?: number; len?: number; w?: number; spread?: number;
  dur?: number; big?: boolean; pool?: number; key?: string; src?: Enemy; sc?: number; pal?: string;
}
export const beastEvq: BeastEv[] = [];
const push = (e: BeastEv) => { if (beastEvq.length < 64) beastEvq.push(e); };

// ------------------------------------------------------------------ 身法
/**
 * 四级以上妖兽的移速：不低于「同境界修士遁速 × 体型系数」。
 * 体型系数：飞禽 1.0 · 迅捷（原速 ≥ 200）0.92 · 寻常 0.8 · 笨重 0.66 · 龟蟾之属 0.54；同一大境界内级别越高越快。
 *   例：七级金睛猿（原速 150）→ 370；九级毒蛟（原速 190）→ 488；五级铁翅雕（飞禽）→ 418。修士遁速：筑基 300 · 结丹 440 · 元婴 610。
 *   疾行时再乘 1.3：直线逃跑甩不掉同阶妖兽，要靠身法、遁术或飞行。
 */
export function beastSpeed(base: number, lv: number, realmSpeed: number, flying: boolean): number {
  if (lv < 4) return base;
  const k = flying ? 1.0 : base >= 200 ? 0.92 : base >= 140 ? 0.8 : base >= 105 ? 0.66 : 0.54;
  const band = lv <= 4 ? 1 : 0.95 + ((lv - 5) % 3) * 0.05;
  return Math.round(Math.max(base * (1 + 0.08 * (lv - 3)), realmSpeed * k * band));
}

/**
 * v0.63：四级以上妖兽的体魄加成（乘在原有数值上）。
 *   气血：每级 +12%，八级起再 +10%（四级 ×1.12 · 七级 ×1.48 · 十级 ×1.94）
 *   妖力：每级 +6%（四级 ×1.06 · 十级 ×1.42）；皮甲：每级 +5%。
 */
export function beastBuff(lv: number): { hp: number; atk: number; def: number } {
  if (lv < 4) return { hp: 1, atk: 1, def: 1 };
  const n = lv - 3;
  return { hp: 1 + 0.12 * n + (lv >= 8 ? 0.1 : 0), atk: 1 + 0.06 * n, def: 1 + 0.05 * n };
}

/** 疾行：离目标尚远时再提三成速，脚下带起妖风扬尘。返回速度倍率 */
export function beastRush(e: Enemy, dt: number): number {
  const a = e as any;
  a.rushT = (a.rushT ?? 0) - dt;
  if (a.rushT <= 0) {
    a.rushT = 0.15;
    push({ k: 'dust', x: e.x, y: e.y + 4 - (e.def.flying ? 60 : 0), el: e.def.flying ? 'wind' : 'earth', lv: e.blv ?? 0, r: 0 });
  }
  return 1.3;
}

// ------------------------------------------------------------------ 妖功
const S = (o: Partial<FoeSkill> & { id: string; name: string; k: SkKind }, el: El): FoeSkill => ({ el, cd: 7, tele: 0.8, pow: 1.8, range: 520, ...o } as FoeSkill);
const ST: Record<string, StatusSpec> = {
  burn: { k: 'burn', dur: 3, ch: 0.5 }, slow: { k: 'slow', dur: 2.5, ch: 0.6 }, freeze: { k: 'freeze', dur: 1.2, ch: 0.5 }, shock: { k: 'shock', dur: 0.8, ch: 0.45 },
  poison: { k: 'poison', dur: 5, ch: 0.7 }, root: { k: 'root', dur: 1.6, ch: 0.85 }, stun: { k: 'stun', dur: 0.7, ch: 0.5 }, break: { k: 'break', dur: 4, ch: 0.5 }, knock: { k: 'knock', dur: 0.4, ch: 0.8 },
};
const DOMAIN_NAME: Record<El, string> = {
  phys: '裂地', fire: '炎狱', ice: '冰狱', water: '怒海', thunder: '雷狱', poison: '毒沼', blood: '血海', ghost: '幽冥', wind: '罡风', earth: '裂地', sword: '万刃', gold: '金雷', metal: '万刃',
};
const stOf = (de: El): StatusSpec => ST[de === 'fire' ? 'burn' : de === 'ice' ? 'freeze' : de === 'poison' ? 'poison' : de === 'thunder' || de === 'gold' ? 'shock' : de === 'blood' || de === 'sword' || de === 'metal' ? 'break' : 'slow'];

/**
 * 四级以上妖兽的本命妖功（接在自动配招之后）：
 *   四级起：按五行一门「妖术」+ 一口「妖息」（扇形吐息，已有吐息的不重复）；
 *   五级起：「妖踏」（跃起砸落）；六级起：妖元护体，且各招调息缩短一成二；
 *   七级起：「妖罡」（环身一震）；八级起：再添一式「妖域」（气血六成以下才用）。
 * 招式沿用已有的结算方式（地上先亮预警、到点落实），落招的光效在 gl/beastgl.ts。
 */
export function beastArts(e: Enemy, el: El, tier: number, has: FoeSkill[]): FoeSkill[] {
  if (tier < 4) return [];
  const out: FoeSkill[] = [];
  const k = 1 + (tier - 4) * 0.05;
  switch (el) {
    case 'fire': out.push(S({ id: 'yg_fire', name: '焚天妖火', k: 'rain', n: 5, r: 95, tele: 1.0, pow: 1.8 * k, range: 600, cd: 11, status: ST.burn, pool: 2.5, pfx: 'pillar' }, 'fire')); break;
    case 'ice': out.push(S({ id: 'yg_ice', name: '玄冰妖域', k: 'nova', r: 250, tele: 1.0, pow: 2.0 * k, range: 240, cd: 12, status: ST.freeze, pfx: 'blizzard' }, 'ice')); break;
    case 'thunder': case 'gold': out.push(S({ id: 'yg_lei', name: '九霄妖雷', k: 'rain', n: 6, r: 90, tele: 0.95, pow: 1.8 * k, range: 640, cd: 11, status: ST.shock, pfx: 'bolt' }, el)); break;
    case 'poison': out.push(S({ id: 'yg_du', name: '万毒妖瘴', k: 'circle', r: 190, tele: 0.9, pow: 1.5 * k, range: 560, cd: 12, status: ST.poison, pool: 4, pfx: 'acid' }, 'poison')); break;
    case 'blood': out.push(S({ id: 'yg_xue', name: '血煞妖光', k: 'circle', r: 170, tele: 0.9, pow: 2.2 * k, range: 580, cd: 11, status: ST.break, pfx: 'darkboom' }, 'blood')); break;
    case 'ghost': out.push(S({ id: 'yg_gui', name: '幽冥鬼手', k: 'circle', r: 150, tele: 0.85, pow: 1.6 * k, range: 580, cd: 10, status: ST.root, pfx: 'hands' }, 'ghost')); break;
    case 'wind': out.push(S({ id: 'yg_feng', name: '罡风妖卷', k: 'circle', r: 150, tele: 0.85, pow: 1.8 * k, range: 560, cd: 10, status: ST.knock, pool: 2, pfx: 'tornado' }, 'wind')); break;
    case 'water': out.push(S({ id: 'yg_shui', name: '覆海妖潮', k: 'rain', n: 5, r: 100, tele: 1.0, pow: 1.7 * k, range: 600, cd: 11, status: ST.slow, pfx: 'geyser' }, 'water')); break;
    case 'sword': case 'metal': out.push(S({ id: 'yg_jin', name: '庚金妖芒', k: 'ring', n: 16, waves: 2, tele: 0.55, pow: 0.9 * k, range: 560, cd: 9 }, el)); break;
    default: out.push(S({ id: 'yg_di', name: '裂地妖震', k: 'nova', r: 240, tele: 0.9, pow: 2.0 * k, range: 230, cd: 11, status: ST.stun, pfx: 'slam' }, 'earth')); break;
  }
  const de: El = el === 'phys' ? 'earth' : el;
  // v0.63：妖息 / 妖踏 / 妖罡
  if (!has.some((s) => s.k === 'cone')) out.push(S({ id: 'yg_breath', name: `妖息·${DOMAIN_NAME[el]}`, k: 'cone', r: 290 + tier * 12, spread: 0.55, tele: 0.7, pow: 1.9 * k, range: 300, cd: 8, status: stOf(de) }, de));
  if (tier >= 5 && !e.def.flying && !has.some((s) => s.k === 'leap')) out.push(S({ id: 'yg_leap', name: '妖踏', k: 'leap', r: 115 + tier * 6, tele: 0.7, pow: 2.1 * k, range: 460, min: 120, cd: 9, status: ST.stun }, de));
  if (tier >= 6 && !has.some((s) => s.k === 'guard')) out.push(S({ id: 'yg_guard', name: '妖元护体', k: 'guard', dur: 5, tele: 0.3, range: 700, cd: 20, hpBelow: 0.7 }, de));
  if (tier >= 7 && !has.some((s) => s.k === 'nova') && !out.some((s) => s.k === 'nova')) out.push(S({ id: 'yg_nova', name: `妖罡·${DOMAIN_NAME[el]}`, k: 'nova', r: 260, tele: 0.8, pow: 2.2 * k, range: 250, cd: 13, status: stOf(de), pfx: CIRCLE_FX[de] }, de));
  if (tier >= 8) {
    out.push(S({ id: 'yg_domain', name: `妖域·${DOMAIN_NAME[el]}`, k: 'rain', n: 9, r: 110, tele: 1.15, pow: 2.1 * k, range: 700, cd: 22, hpBelow: 0.6, status: ST[de === 'fire' ? 'burn' : de === 'ice' ? 'freeze' : de === 'poison' ? 'poison' : de === 'thunder' || de === 'gold' ? 'shock' : 'slow'], pool: de === 'fire' || de === 'poison' ? 3 : 0, pfx: CIRCLE_FX[de] }, de));
  }
  if (tier >= 6) for (const s of out) if (s.k !== 'guard') s.cd = Math.round(s.cd * 0.88 * 10) / 10;
  return out;
}

// ------------------------------------------------------------------ 特效（只排队，不绘制）
/** 起手：脚下亮出一圈本命色的法阵，四周妖气向身上收拢，直到招式落下 */
export function beastCastFx(e: Enemy, sk: FoeSkill) {
  const lv = e.blv ?? 0;
  if (lv < 4 || e.def.kind === 'human') return;
  const size = e.def.look?.size ?? 1;
  push({ k: 'cast', x: e.x, y: e.y, el: sk.el, lv, r: (48 + lv * 7) * size * (sk.ult ? 1.5 : 1), dur: Math.max(0.5, sk.tele + 0.25), big: !!sk.ult, src: e });
}

/** 落招：按招式形状（圆 / 扇 / 线）与五行放出光效。只管四级以上妖兽的招，以及明确带了 pfx 标记的招 */
export function beastBoomFx(h: Hz) {
  const src = h.src, lv = src && src.def.kind !== 'human' ? src.blv ?? 0 : 0;
  if (lv < 4 && !h.pfx) return;
  push({ k: 'boom', x: h.x, y: h.y, el: h.el, lv, r: h.r, shape: h.k, ang: h.ang, len: h.len, w: h.w, spread: h.spread, big: !!h.big, pool: h.pool, key: h.pfx });
}

/**
 * 宗门 / 大战用的阵纹光效（原先借用像素特效的 rune / holy / mana，现在同样走 WebGL）：
 *   rune 地面符阵 · holy 天降光柱 · mana 灵光聚拢；pal：'gold' 金 / 'blood' 血 / 缺省 青白。sc 为大小倍率。
 */
export function sealFx(key: string, pal: string | undefined, x: number, y: number, sc: number, o: { dur?: number; loop?: boolean; alpha?: number } = {}) {
  push({ k: 'seal', key, pal, x, y, sc, el: 'gold', lv: 0, r: 44 * sc, dur: o.dur ?? 1.2 });
}
