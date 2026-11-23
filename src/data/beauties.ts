// 第五步：知交（v0.70 起不再登场，见下方 BEAUTIES）
import type { Look } from '../gfx/character';
import type { Pers, Faction } from '../world/npc';

export interface Chapter {
  id: string;
  title: string;
  /** 解锁条件 */
  req: { favor?: number; realm?: number; flag?: string; notFlag?: string; item?: string; year?: number };
  hint: string;                              // 友人录中的提示
  text: string;                              // 正文（\n 分段）
  choices: { label: string; favor: number; flag?: string; reply: string; give?: { id: string; n: number }; take?: { id: string; n: number }; tone?: 'love' | 'good' | 'bad' | 'gold'; exp?: number; end?: 'companion' | 'part' }[];
}
export interface BeautyDef {
  id: string; name: string; title: string; portrait: string;
  home: string; realm: number; stage: number; faction: Faction; pers: Pers; age: number;
  color: string;                 // 助战法术光色 'r,g,b'
  intro: string;                 // 友人录简介
  likes: string[];               // 偏爱的礼物（物品 id / 类型）
  greet: string[];               // 日常问候（按好感由低到高）
  follow: string;                // 同行时的台词
  bonus: { kind: 'atk' | 'def' | 'regen' | 'sense' | 'exp' | 'luck'; v: number; text: string };
  look: Look;
  chapters: Chapter[];
}

const base = (o: Partial<Look>): Look => ({
  sex: 'f', height: 0.97, build: 0.88, skin: '#f6e2d0', hair: '#15110f', hairStyle: 'long', bangs: false,
  robe: '#e8e8f0', inner: '#f8f4ee', trim: '#9aa0b0', belt: '#6a6a80', pants: '#d8d8e4', boots: '#6a5a5a',
  robeLen: 'long', sleeve: 'wide', back: 'none', waist: 'jade', hand: 'none', lash: true, lip: '#c84a5a', eyeTint: '#5a3a2a',
  swordColor: '#bfe8ff', ...o,
});

// v0.70：原创化——原设知交全部移除，知交系统不再有人登场。
// 数据结构与接口保留（模组数据表 beauties 仍在，只是空表），旧存档里的知交在读档时移除（world/game.ts）。
export const BEAUTIES: BeautyDef[] = [];

export const BEAUTY_BY_ID: Record<string, BeautyDef> = Object.fromEntries(BEAUTIES.map((b) => [b.id, b]));
export function beautyLook(id: string): Look { return BEAUTY_BY_ID[id]?.look ?? base({}); }
