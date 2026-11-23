// P10 收尾：宗门元婴残害同门、叛出成散修时也受散修元婴名额（demog.ts 的 ROGUE_YY_CAP）约束：
// 本图名额满了远遁到还有空位的图；三张图都满了被师门清理门户。名额没满就留在本图做散修（行为照旧）。
//   TSX_DISABLE_CACHE=1 npx tsx tools/test-betray-quota.ts
import './env';
import assert from 'node:assert/strict';
(globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
(globalThis as any).localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const { ROGUE_YY_CAP, rogueYYRoom } = await import('../src/world/demog');
const terrain = new Terrain(); terrain.build();
const g: any = new Game(terrain);
const N = g.npcs, L = g.living;
const rogueYY = (m: string) => N.list.filter((o: any) => o.alive && o.realm >= 4 && !o.canon && !o.ros && o.faction !== 'sect' && o.faction !== 'demon' && (o.map ?? 'tiannan') === m).length;
// 造一位宗门元婴和一个被害的同门
const mk = (id: string, realm: number, map = 'tiannan') => {
  const base = N.list.find((o: any) => o.alive && !o.canon && (o.map ?? 'tiannan') === 'tiannan')!;
  const d = { ...base, id, name: id, realm, stage: 0, faction: 'sect', sect: 'huangfeng', home: 'huangfeng', map, alive: true, canon: false, ros: false, gz: undefined, ties: [], hate: [], plan: undefined };
  N.list.push(d); N.byId.set(id, d); return d;
};
// 散修元婴凑到名额上限：先把南荒补满（不够就造）
const fill = (m: string) => { let i = 0; while (rogueYY(m) < ROGUE_YY_CAP[m as 'tiannan']) { const r = mk(`fill_${m}_${i++}`, 4, m); r.faction = 'rogue'; r.sect = undefined; } };
fill('tiannan');
assert.ok(!rogueYYRoom(N.list, 'tiannan'), '南荒散修元婴已满');
const k1 = mk('yy_k1', 4), v1 = mk('yy_v1', 2);
L.betray(k1, v1, g.day);
assert.ok(k1.alive && k1.faction === 'rogue' && k1.map !== 'tiannan', `南荒名额满：叛出的元婴远遁他图（现在 ${k1.map}，${k1.alive ? '在世' : '已死'}）`);
assert.ok(rogueYY('tiannan') <= ROGUE_YY_CAP.tiannan, '南荒散修元婴没有超名额');
// 三张图都满：清理门户
fill('luanxing'); fill('dajin');
const k2 = mk('yy_k2', 4), v2 = mk('yy_v2', 2);
L.betray(k2, v2, g.day);
assert.ok(!k2.alive, '三张图都满：叛出的元婴被清理门户');
for (const m of ['tiannan', 'luanxing', 'dajin']) assert.ok(rogueYY(m) <= ROGUE_YY_CAP[m as 'tiannan'], `${m} 散修元婴没有超名额（${rogueYY(m)}）`);
// 结丹叛出不受元婴名额影响：留在本图做散修
const k3 = mk('jd_k3', 3), v3 = mk('jd_v3', 2);
L.betray(k3, v3, g.day);
assert.ok(k3.alive && k3.faction === 'rogue' && k3.map === 'tiannan', '结丹叛出照旧留在本图做散修');
console.log(`PASS 元婴叛出受散修元婴名额约束：本图满了远遁他图（${k1.map}），三图都满被清理门户；结丹叛出照旧`);
process.exit(0);
