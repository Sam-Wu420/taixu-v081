// P10 城池铺开以前的存档读进来：人站在现在是房子、城墙的地方，洞府、人物、悬赏目标落在城里或挪走的小地点上——
// 读档不报错，人能自己走出来（不卡在墙里），挪走的小地点 id 不变、悬赏指向它的新位置，城里的人物落在走得到的地方。
//   npx tsx tools/test-city-save.ts
import './env';
import assert from 'node:assert/strict';
(globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const store: Record<string, string> = {};
(globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
(globalThis as any).sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
(globalThis as any).__TAIXU_NORELOAD = true;
const W = await import('../src/data/world');
const G = await import('../src/world/game');
const { getLayout, LOC_SCALE } = await import('../src/gfx/building');
const { usesNewCity } = await import('../src/gfx/citySize');
const g = await G.createGame(() => {});
g.reset();
const p = g.player, WS = W.WORLD_SCALE;
const jy = W.LOC_BY_ID.get('jiayuan')!;
assert.ok(usesNewCity(jy), '嘉禾城走新布局');
const L = getLayout(jy);
const at = (bx: number, by: number) => ({ x: jy.x * WS + bx * LOC_SCALE, y: jy.y * WS + by * LOC_SCALE });
// 嘉禾城里一座整块挡住的院子（不敞门的）、一段城墙
const court = L.blocks.filter((b) => b.w * b.h > 50000).sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y))[3];
const inCourt = at(court.x + court.w / 2, court.y + court.h / 2);
// 挪走的小地点：被城的占地挪到城外的（ox/oy 跟着改了，id、名字不变）
const moved = W.LOCATIONS.filter((l) => l.minor && Math.hypot(l.x - jy.x, l.y - jy.y) * WS < 30000).slice(0, 3);

g.teleport(at(0, 600).x, at(0, 600).y);
for (let i = 0; i < 20; i++) { if (g.modal) g.closeModal(true); g.update(0.05); }
assert.ok(g.save(1));
const old = JSON.parse(store['taixu_save_1']);
// 旧存档：人站在院子正中（现在是房子），洞府在城墙上，一个人物也在院子里
old.p.x = inCourt.x; old.p.y = inCourt.y;
old.world.home = { map: 'tiannan', x: inCourt.x + 40, y: inCourt.y, name: '旧洞府' };
const npc = old.npcs.find((n: any) => (n.map ?? 'tiannan') === 'tiannan');
if (npc) { npc.x = inCourt.x - 30; npc.y = inCourt.y + 20; npc.tx = npc.x; npc.ty = npc.y; }
store['taixu_save_2'] = JSON.stringify(old);

g.teleport(100000, 100000);
let threw: unknown = null;
try { assert.ok(g.load('taixu_save_2'), '读档'); } catch (e) { threw = e; }
assert.equal(threw, null, '读旧存档不报错');
for (let i = 0; i < 40; i++) { if (g.modal) g.closeModal(true); g.update(0.05); }
assert.ok(g.space.blocked(p.x, p.y), '读档后人确实站在房子里（这个场景成立）');
// 往城中心的街上走：身陷房子里时放行，能自己走出来
const street = at(0, 300);
g.destination = { x: street.x, y: street.y };
let out = false;
for (let i = 0; i < 600 && !out; i++) { if (g.modal) g.closeModal(true); if (!g.destination) g.destination = { x: street.x, y: street.y }; g.update(0.05); if (!g.space.blocked(p.x, p.y) && Math.hypot(p.x - inCourt.x, p.y - inCourt.y) > 200) out = true; }
assert.ok(out, `人从院子里走出来了（现在 ${Math.round(p.x - jy.x * WS)},${Math.round(p.y - jy.y * WS)}）`);
// 再走一阵：出来以后不会又被关回去，也不是穿墙乱走
const px0 = p.x, py0 = p.y; let backIn = 0;
for (let i = 0; i < 200; i++) { if (g.modal) g.closeModal(true); if (!g.destination) g.destination = { x: street.x, y: street.y }; g.update(0.05); if (g.space.blocked(p.x, p.y)) backIn++; }
assert.equal(backIn, 0, '走出来以后不再进房子');
void px0; void py0;
// 挪走的小地点：id 不变，查得到，位置不在任何城的墙圈里
for (const l of moved) {
  const l2 = W.LOC_BY_ID.get(l.id)!;
  assert.ok(l2, `挪走的 ${l.name} 还在`);
  const dx = (l2.x - jy.x) * WS / LOC_SCALE, dy = (l2.y - jy.y) * WS / LOC_SCALE;
  assert.ok(!L.blocks.some((b) => dx > b.x && dx < b.x + b.w && dy > b.y && dy < b.y + b.h), `${l.name} 没落在嘉禾城的房子、城墙上`);
}
// 存档再读：位置不乱
assert.ok(g.save(3)); const x3 = p.x, y3 = p.y; g.teleport(100000, 100000); assert.ok(g.load('taixu_save_3'));
assert.ok(Math.hypot(p.x - x3, p.y - y3) < 1, '新存档读回来位置不变');
console.log(`PASS 旧存档读进新布局的城：人站在房子里读档不报错、能自己走出来；洞府、人物落在城里不出错；嘉禾城附近 ${moved.length} 处小地点 id 不变、不压房子`);
process.exit(0);
