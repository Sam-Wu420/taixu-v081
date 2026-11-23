// 近战兵器（物品 / 画面这一层）：主角手里那把画到人物身上；NPC 身上带的兵器按哈希定（不取随机数）。
// 出招（把兵器接进近战）是下一步的事，这里不碰 brawl.ts。
import * as C from './cultivation';
import type { Look } from '../gfx/character';
import type { WeaponKind, WeaponLook } from '../data/weapons';

/** 32 位整数哈希（和 gear.ts 的同一路子，常数不同） */
export function armsHash(a: number, b = 0): number {
  let x = (a | 0) ^ Math.imul(b | 0, 0x9e3779b1) ^ 0x51ed270b;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d); x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return (x ^ (x >>> 16)) >>> 0;
}

/** NPC 的这几样就够定兵器（npc.ts 的 NpcData 满足它） */
export interface ArmsNpc { seed: number; realm: number; role?: string; faction?: string; sect?: string }
/** 门派偏好：断刀坞使刀、重岳剑门与玄煞宗使重兵、青玄门使棍、藏剑门与青霞谷多是剑修 */
const SECT_KIND: Record<string, WeaponKind> = { huadao: 'heavy', jujian: 'heavy', tiansha: 'heavy', qixuan: 'spear', gujian: 'sword', huangfeng: 'sword' };

/**
 * NPC 身上带的兵器（没有就 null）：只看种子、境界、身份、门派——一个随机数都不取，老存档、固定种子的世界里人人照旧。
 * 剑修、体修、散修常带；凡人里只有护卫（guard）带枪棍；女修少一些。
 */
export function npcWeapon(d: ArmsNpc): WeaponLook | null {
  const role = d.role ?? 'cultivator';
  if (role !== 'cultivator' && role !== 'guard' && role !== 'female') return null;
  const x = armsHash(d.seed, 0xa7);
  const roll = (x % 1000) / 1000;
  const pref = d.sect ? SECT_KIND[d.sect] : undefined;
  const chance = role === 'guard' ? 0.75 : pref ? 0.7 : d.faction === 'rogue' || d.faction === 'demon' ? 0.38 : role === 'female' ? 0.14 : 0.24;
  if (roll >= chance) return null;
  const k2 = (x >>> 10) % 100;
  const kind: WeaponKind = role === 'guard' ? (k2 < 70 ? 'spear' : 'heavy') : pref ?? (k2 < 55 ? 'sword' : k2 < 78 ? 'spear' : 'heavy');
  if (kind === 'fist') return null;
  const tier = Math.max(0, Math.min(6, Math.round(d.realm * 1.25 - 0.6 + ((x >>> 17) % 3) * 0.5)));
  return { kind, tier };
}

/** 字符串哈希（外观里的颜色串） */
function strHash(s: string, h = 0x811c9dc5): number { for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193); return h >>> 0; }
/** 战斗里随机生成的人形敌人（combat.ts、melee.ts 用 randomLook 造的）没有种子可查：拿外观本身（颜色、身高、体格）做种子——外观就是按那个种子生成的 */
export function lookSeed(look: Look): number {
  return strHash(`${look.robe}|${look.hair}|${look.skin}|${look.hairStyle}|${look.inner ?? ''}`, Math.round((look.height ?? 1) * 1e4) ^ Math.imul(Math.round((look.build ?? 1) * 1e4), 7919));
}
/** 这几样就够定兵器（Enemy 满足它） */
export interface ArmsFoe { look?: Look; school?: string; realm: number; ally?: boolean; def: { kind: string; id: string; evil?: boolean } }
/**
 * 战斗里的人形敌人 / 同阵修士身上带的兵器（没有就 null）：按外观哈希定，一个随机数都不取（固定种子的测试照旧）。
 * 体修（tixiu 流派、试招用的铁拳散修 / 木人）一律空手；断刀坞、重岳剑门、玄煞宗多使重兵，青玄门使枪棍，藏剑门、青霞谷多是剑；
 * 魔修、散修四成上下带兵器，其余三成。外观里已经有兵器的（世界里的 NPC 转成的敌人）照它的。
 */
export function foeWeapon(e: ArmsFoe): WeaponLook | null {
  if (e.def.kind !== 'human' || !e.look || e.school === 'tixiu' || e.def.id.startsWith('bx_')) return null;
  if (e.look.weapon) return e.look.weapon.kind === 'fist' ? null : e.look.weapon;
  const x = armsHash(lookSeed(e.look), 0x3c5);
  const pref = e.school ? SECT_KIND[e.school] : undefined;
  const chance = pref ? 0.7 : e.def.evil ? 0.42 : 0.32;
  if ((x % 1000) / 1000 >= chance) return null;
  const k2 = (x >>> 10) % 100;
  const kind: WeaponKind = pref ?? (k2 < 50 ? 'sword' : k2 < 76 ? 'spear' : 'heavy');
  const tier = Math.max(0, Math.min(6, Math.round(e.realm * 1.25 - 0.6 + ((x >>> 17) % 3) * 0.5)));
  return { kind, tier };
}

/** 主角此刻手里该画的兵器（兵器槽 > 剑类本命法宝 > 空手） */
export function heroWeaponLook(h: C.Hero): WeaponLook | undefined {
  const w = C.heldWeapon(h);
  if (w.kind === 'fist') return undefined;
  if (w.from === 'bond' && w.item) { const col = C.bondSwordColor(w.item); return { kind: 'sword', tier: w.tier, form: 'jian', ...(col ? { color: col } : {}) }; }
  return { kind: w.kind, tier: w.tier };
}

const sameW = (a?: WeaponLook, b?: WeaponLook) => (!a && !b) || (!!a && !!b && a.kind === b.kind && a.tier === b.tier && a.form === b.form && a.color === b.color);
/** 外观换上（或卸下）这把兵器；没变就原样返回（人物缓存按外观的 JSON 认，别每帧换新对象） */
export function lookWithWeapon(look: Look, w: WeaponLook | undefined): Look {
  if (sameW(look.weapon, w)) return look;
  const out: Look = { ...look };
  if (w) out.weapon = w; else delete out.weapon;
  return out;
}
/** 每帧：主角外观跟着兵器槽 / 本命法宝走（Game.update 里调一次） */
export function syncHeroArms(g: { hero: C.Hero; player: { look: Look } }) {
  const p = g.player; if (!p?.look || !g.hero) return;
  const nl = lookWithWeapon(p.look, heroWeaponLook(g.hero));
  if (nl !== p.look) p.look = nl;
}
