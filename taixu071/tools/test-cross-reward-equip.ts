// 跨系统奖励落地兜底（grantOrDrop）与装备-背包同步（syncEquipWithBag）回归测试
import './env';
import assert from 'node:assert/strict';

const store = new Map<string, string>();
(globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, String(v)); },
  removeItem: (k: string) => { store.delete(k); },
};

const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const C = await import('../src/world/cultivation');

const terrain = new Terrain();
terrain.build();
const g = new Game(terrain);

// 1) removeItem 消耗掉最后一件已穿戴法器时自动清理 h.equip；失败事务回滚不破坏 h.equip
const beforeN = C.bagCount(g.hero, 'art_qingfeng');
if (beforeN === 0) C.addItem(g.hero, 'art_qingfeng', 1);
const ownedN = C.bagCount(g.hero, 'art_qingfeng');
g.hero.equip.flight = 'art_qingfeng';
C.addItem(g.hero, 'pill_zhuji', Number.MAX_SAFE_INTEGER - 2);
const failedTx = C.exchangeItemsWithCommit(
  g.hero,
  [{ id: 'art_qingfeng', n: ownedN }],
  [{ id: 'pill_zhuji', n: 5 }],
);
assert.equal(failedTx, false);
assert.equal(g.hero.equip.flight, 'art_qingfeng', 'failed exchange must not clear equip');
assert.equal(C.bagCount(g.hero, 'art_qingfeng'), ownedN);

const removed = C.removeItem(g.hero, 'art_qingfeng', ownedN);
assert.equal(removed, ownedN);
assert.equal(g.hero.equip.flight, undefined, 'syncEquipWithBag clears phantom equipped slot');

// 2) grantOrDrop 在加包拒收（整数溢出上限）时自动转成受保护地面掉落（blocked: true），绝不丢失
g.combat.loot = [];
const res = g.grantOrDrop([
  { id: 'mat_lingshi', n: 100 },
  { id: 'pill_zhuji', n: 5 },
], '跨系统试炼');
assert.equal(res.allAdded, false);
assert.equal(res.dropped, 1);
assert.equal(C.bagCount(g.hero, 'mat_lingshi') >= 100, true);
const dropped = g.combat.loot.find((d) => d.id === 'pill_zhuji' && d.n === 5);
assert.ok(dropped && dropped.blocked === true, 'rejected reward falls back to protected ground drop');

console.log('cross-system grantOrDrop & syncEquipWithBag passed');
