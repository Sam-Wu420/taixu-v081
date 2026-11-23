// 回归：「银光剑获取之后背包里不显示」。node node_modules/tsx/dist/cli.mjs tools/test-yinguangjian.ts
// 游戏里没有叫「银光剑」的东西：玩家说的是银辉剑（art_yinhui，「上品飞剑法器，银光凛凛」），或一把银色的剑类兵器（青钢长剑 wpn_sword_1 等）。
// 一、银辉剑走真实来路（劫修掉落→拾取、斩杀修士储物袋散落→拾取）入袋，并且储物袋界面按自己的格子逻辑（C.bagCells）列得出来、SSR 渲染里有这一格；存读档后还在。
// 二、根子：读档时 mergeHerbs 把同 id 的装备（每件单独一格）并成一堆——身上穿着一把、袋里那把同名的被并进身上那把，格子里就不见了。
// 三、已经被并坏的旧存档：读档拆回一件一格，袋里那把重新出现。
import { createCanvas } from './env';
const CW = 1280, CH = 800;
const store = new Map<string, string>();
(globalThis as any).window = { innerWidth: CW, innerHeight: CH, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
(globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } };

const React = await import('react');
const { renderToString } = await import('react-dom/server');
const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const { Enemy } = await import('../src/world/combat');
const { ENEMIES } = await import('../src/data/enemies');
const C = await import('../src/world/cultivation');
const { Inventory } = await import('../src/ui/Inventory');

const terrain = new Terrain(); terrain.build();
const g: any = new Game(terrain); g.reset();
const cv: any = createCanvas(CW, CH); cv.clientWidth = CW; cv.clientHeight = CH;
let fails = 0;
const ok = (cond: any, msg: string) => { if (!cond) { fails++; console.log('FAIL', msg); } else console.log('ok  ', msg); };
const step = (n: number) => { for (let i = 0; i < n; i++) { g.update(1 / 30); if (g.modal) g.closeModal(true); } };
/** 界面会不会列出这件：储物袋打开时先补排位，再按页签取格子（和 Inventory.tsx 同一套） */
const listed = (hh: any, pred: (b: any) => boolean) => { C.ensureBagPos(hh); return [...C.bagCells(hh, 'gear').values()].filter(pred); };
const rendered = (id: string) => renderToString(React.createElement(Inventory, { game: g, onClose() {} })).split(`data-id="${id}"`).length - 1;
const yh = (b: any) => b.id === 'art_yinhui';
step(10);
const p = g.player;

// ---------------------------------------------------------------- 一、银辉剑
{
  ok(C.tabOf('art_yinhui') === 'gear', '银辉剑归「装备」页签');
  // 劫修（筑基劫修 zhujixiu 的掉落表里有银辉剑）被斩，掉在地上，走过去拾起
  const e = new Enemy((ENEMIES as any).zhujixiu, p.x + 60, p.y, 2, 0);
  e.def = { ...e.def, drops: [{ id: 'art_yinhui', ch: 1 }] };
  (e as any).gearDropped = true;   // 这一回只看掉落表那一件
  g.combat.enemies.push(e); (g.combat as any).kill(e);
  step(45);
  ok(C.bagCount(g.hero, 'art_yinhui') === 1, '劫修掉落的银辉剑拾起后进了储物袋');
  ok(listed(g.hero, yh).length === 1, '储物袋的格子里列出了银辉剑');
  ok(rendered('art_yinhui') === 1, '储物袋界面（SSR）画出了银辉剑那一格');
  // 斩杀修士：储物袋散落一地（foegear）里带着银辉剑，逐件走过去拾
  const e2 = new Enemy((ENEMIES as any).zhujixiu, p.x + 60, p.y, 2, 0);
  e2.def = { ...e2.def, drops: [] };
  (e2 as any).gear = { stones: 100, arts: ['art_yinhui'], items: [], gongfa: '', el: 'sword', sect: '', wardK: 1, spdK: 1, scrollTier: 0, scrollCh: 0 };
  g.combat.enemies.push(e2); (g.combat as any).kill(e2);
  for (let k = 0; k < 40 && g.combat.loot.length; k++) { const l = g.combat.loot[0]; p.x = l.x; p.y = l.y; step(25); }
  ok(C.bagCount(g.hero, 'art_yinhui') === 2, '修士储物袋散落的银辉剑拾起后进了储物袋（同名堆叠成 2）');
  ok(listed(g.hero, yh).length === 1 && listed(g.hero, yh)[0].n === 2, '格子里一格显示 ×2');
  g.save(1);
  const g2: any = new Game(terrain); ok(g2.load('taixu_save_1'), '读档');
  ok(listed(g2.hero, yh).length === 1 && C.bagCount(g2.hero, 'art_yinhui') === 2, '读档后银辉剑还在格子里');
}

// ---------------------------------------------------------------- 二、身上一把、袋里一把同名的剑：读档不能并
{
  const h = g.hero;
  C.addItem(h, 'wpn_sword_1', 1); C.addItem(h, 'wpn_sword_1', 1);
  const [a, b] = h.bag.filter((x: any) => x.id === 'wpn_sword_1');
  C.wearGear(h, a);
  C.addItem(h, 'gear_ring_1', 1); C.addItem(h, 'gear_ring_1', 1);
  const spare = (hh: any) => listed(hh, (x: any) => x.id === 'wpn_sword_1');
  ok(spare(h).length === 1 && spare(h)[0] === b, '刚拿到：袋里那把青钢长剑在格子里');
  g.save(1);
  const g3: any = new Game(terrain); g3.load('taixu_save_1');
  const h3 = g3.hero, swords = h3.bag.filter((x: any) => x.id === 'wpn_sword_1');
  ok(swords.length === 2 && swords.every((x: any) => x.n === 1), '读档后两把剑仍是一件一格（没被并成一堆）');
  ok(swords.filter((x: any) => x.worn === 'weapon').length === 1, '身上那把还穿着');
  ok(spare(h3).length === 1 && spare(h3)[0].uid === b.uid, '袋里那把读档后照样列在格子里，独件编号不变');
  ok(JSON.stringify(spare(h3)[0].affix) === JSON.stringify(b.affix), '袋里那把的词条没丢');
  ok(h3.bag.filter((x: any) => x.id === 'gear_ring_1').length === 2, '两枚同名戒指也各占一格（词条各自保留）');
  ok(C.heldWeapon(h3).item === 'wpn_sword_1' && C.heldWeapon(h3).from === 'slot', '兵器槽仍握着那把剑');
}

// ---------------------------------------------------------------- 三、已经被并坏的旧存档：读档拆回来
{
  const raw = JSON.parse(store.get('taixu_save_1')!);
  const bag = raw.hero.bag as any[];
  const i0 = bag.findIndex((x) => x.id === 'wpn_sword_1' && x.worn), i1 = bag.findIndex((x) => x.id === 'wpn_sword_1' && !x.worn);
  bag[i0].n = 2; bag.splice(i1, 1);   // 旧版读档的样子：袋里那把并进了身上那把（n=2、带着穿戴记号）
  const r0 = bag.findIndex((x) => x.id === 'gear_ring_1'); bag[r0].n = 2; bag.splice(bag.findIndex((x, i) => i !== r0 && x.id === 'gear_ring_1'), 1);
  store.set('taixu_save_1', JSON.stringify(raw));
  const g4: any = new Game(terrain); g4.load('taixu_save_1');
  const h4 = g4.hero, swords = h4.bag.filter((x: any) => x.id === 'wpn_sword_1');
  ok(swords.length === 2 && swords.every((x: any) => x.n === 1) && swords.filter((x: any) => x.worn).length === 1, '并坏的旧档：剑拆回两件，只有一把穿着');
  ok(listed(h4, (x: any) => x.id === 'wpn_sword_1').length === 1, '并坏的旧档：袋里那把重新出现在格子里');
  ok(new Set(h4.bag.filter((x: any) => x.uid !== undefined).map((x: any) => x.uid)).size === h4.bag.filter((x: any) => x.uid !== undefined).length, '拆出来的装备独件编号不重号');
  ok(listed(h4, (x: any) => x.id === 'gear_ring_1').length === 2, '并坏的旧档：两枚戒指拆回两格');
  g.hero = h4; ok(rendered('wpn_sword_1') === 1, '储物袋界面（SSR）画出了袋里那把剑');
}

console.log(fails ? `\n${fails} 项失败` : '\n全部通过');
process.exit(fails ? 1 : 0);
