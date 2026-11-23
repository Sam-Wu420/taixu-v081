// 南荒放大（TN_K）之前的存档（含原版 v0.57 的存档）读进来：南荒里的位置、人物、洞府、迷雾按倍数换算，别的图不动。
import './env';
import assert from 'node:assert/strict';
(globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const store: Record<string, string> = {};
(globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
(globalThis as any).sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
(globalThis as any).__TAIXU_NORELOAD = true;
const W = await import('../src/data/world');
const G = await import('../src/world/game');
const g = await G.createGame(() => {});
g.reset();
const p = g.player, K = W.TN_K;
assert.equal(W.MACRO_W, 1000 * K); assert.equal(W.MACRO_H, 700 * K);
const hf = W.LOC_BY_ID.get('huangfeng')!;
g.teleport(hf.x * W.WORLD_SCALE + 900, hf.y * W.WORLD_SCALE + 1400);
for (let i = 0; i < 30; i++) { if (g.modal) g.closeModal(true); g.update(0.05); }
assert.ok(g.isExplored(p.x, p.y), '站过的地方探索过了');
assert.ok(g.save(1));
const now = JSON.parse(store['taixu_save_1']);
assert.equal(now.tn, K, '新存档记着南荒的倍数');
// 造一份「放大之前」的存档：没有 tn 字段，南荒里的坐标都是原来的一半，迷雾是旧尺寸
const old = JSON.parse(store['taixu_save_1']);
delete old.tn; old.p.x /= K; old.p.y /= K;
for (const n of old.npcs) if ((n.map ?? 'tiannan') === 'tiannan') { n.x /= K; n.y /= K; n.tx /= K; n.ty /= K; }
{ const ow = Math.ceil(1000 * W.WORLD_SCALE / G.FOG_CELL), oh = Math.ceil(700 * W.WORLD_SCALE / G.FOG_CELL), a = new Uint8Array(ow * oh);
  const cx = Math.floor(old.p.x / G.FOG_CELL), cy = Math.floor(old.p.y / G.FOG_CELL); for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) a[y * ow + x] = 1;
  const T = await import('../src/world/travel'); old.fogs = { ...old.fogs, tiannan: T.encodeFog(a) }; }
old.world.home = { map: 'tiannan', x: 50000, y: 60000, name: '旧洞府' };
store['taixu_save_2'] = JSON.stringify(old);
const npc0 = now.npcs.find((n: any) => (n.map ?? 'tiannan') === 'tiannan');
g.teleport(100000, 100000);
assert.ok(g.load('taixu_save_2'));
assert.ok(Math.abs(p.x - now.p.x) < 600 && Math.abs(p.y - now.p.y) < 600, `人回到放大后的同一处：${Math.round(p.x)},${Math.round(p.y)} vs ${Math.round(now.p.x)},${Math.round(now.p.y)}`);
const n1 = g.npcs.list.find((n) => n.id === npc0.id)!;
assert.ok(Math.abs(n1.x - npc0.x) < 2 && Math.abs(n1.y - npc0.y) < 2, '人物的位置按倍数换算');
assert.deepEqual([(g.ws as any).home.x, (g.ws as any).home.y], [50000 * K, 60000 * K], '洞府的位置按倍数换算');
assert.ok(g.isExplored(p.x, p.y) && !g.isExplored(p.x + 30000, p.y), '迷雾跟着放大：站过的那一片还是探索过的');
// 再存再读：不会再乘一遍
assert.ok(g.save(3)); const x1 = p.x; g.teleport(100000, 100000); assert.ok(g.load('taixu_save_3')); assert.ok(Math.abs(p.x - x1) < 1, '新存档读回来位置不变');
console.log(`PASS 南荒放大 ${K} 倍：旧存档里南荒的位置、人物、洞府、迷雾都按倍数换算；新存档读写不变；南荒 ${W.MACRO_W}×${W.MACRO_H} 格，地点 ${W.LOCATIONS.length} 处`);
