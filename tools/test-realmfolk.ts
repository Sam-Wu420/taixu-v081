// 别界的人（world/realmfolk.ts）：头一回落到一界就按种子撒一批有名有姓的人（每座城、坊市各一位掌柜），
// 那一界的宗门登进宗门名册（掌门、长老、门人照人界的办法出），寻常城池也有结丹坐镇；存读档不重复、换个存档还是同一批人。
import './env';
import assert from 'node:assert/strict';

(globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const store: Record<string, string> = {};
(globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
(globalThis as any).sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
(globalThis as any).__TAIXU_NORELOAD = true;

const G = await import('../src/world/game');
const W = await import('../src/data/world');
const Z = await import('../src/data/zhujie');
const { SECT_DEF } = await import('../src/world/roster');
const { garrisonOf } = await import('../src/world/garrison');
const { REALM_FOLK } = await import('../src/world/realmfolk');
const g = await G.createGame(() => {});
g.reset();

// 取一界陆上的、一界海岛的
let land = -1, sea = -1;
for (let i = 1; i < 400 && (land < 0 || sea < 0); i++) { const r = Z.realmAt(i); if (r.kind === 'human') continue; if (r.kind === 'archipelago') { if (sea < 0) sea = i; } else if (land < 0) land = i; }
const lines: string[] = [], first = new Map<string, string>();
for (const idx of [land, sea]) {
  const map = `realm-${idx}` as any;
  W.ensureMap(map);
  const cap = W.locsOf(map).find((l) => l.hub === 'capital') ?? W.locsOf(map)[0];
  g.travel.pending = { map, x: cap.x * W.WORLD_SCALE, y: cap.y * W.WORLD_SCALE, via: 'portal' } as any;
  const ok = g.switchMap(map); g.travel.pending = null;
  assert.ok(ok, `换到 ${map}`);
  assert.equal(W.ACTIVE_MAP, map);
  const folk = g.npcs.list.filter((n) => n.map === map && n.id.startsWith('rf'));
  assert.equal(folk.length, REALM_FOLK, `撒了 ${REALM_FOLK} 人：${folk.length}`);
  assert.ok(folk.every((n) => n.name && n.name.length >= 2 && W.LOC_BY_ID.get(n.home)?.map === map), '都有名字、家在这一界');
  const hubs = W.locsOf(map).filter((l) => l.hub);
  const shops = hubs.filter((l) => l.hub === 'capital' || l.hub === 'city' || l.hub === 'market');
  for (const l of shops) assert.ok(folk.some((n) => n.home === l.id && n.stay && /掌柜|坊主/.test(n.title ?? '')), `${l.name}有掌柜`);
  const sects = hubs.filter((l) => l.hub === 'sect');
  assert.ok(sects.length >= 2, '至少两个宗门');
  for (const s of sects) { const d = SECT_DEF.get(s.id); assert.ok(d && d.name === s.name && d.n > 20, `${s.name}登进了宗门名册`); assert.equal(garrisonOf(s), null, '宗门由宗门自己坐镇，不另设城主'); }
  const cities = hubs.filter((l) => l.hub === 'city' || l.hub === 'capital');
  for (const c of cities) assert.ok(garrisonOf(c), `${c.name}有人坐镇`);
  // 宗门名册真的能出人：掌门
  const head = g.roster.materialize(sects[0].id, 0);
  assert.ok(head && head.name && head.realm >= 3 && (head.title ?? '').includes(sects[0].name), `${sects[0].name}的掌门：${head?.title} ${head?.name}`);
  // 存读档：不重复撒、还是同一批人
  const names = folk.map((n) => n.name).join(','); first.set(map, names);
  assert.ok(g.save(1)); assert.ok(g.load('taixu_save_1'));
  const again = g.npcs.list.filter((n) => n.map === map && n.id.startsWith('rf'));
  assert.equal(again.length, REALM_FOLK, '读档后不重复撒');
  assert.equal(again.map((n) => n.name).join(','), names, '读档后还是那批人');
  // 跑几个游戏日不出错（别界的人照样过日子）
  for (let t = 0; t < 12; t += 0.05) { g.paused = false; g.update(0.05); }
  lines.push(`${map}（${Z.realmAt(idx).kind}）${folk.length} 人、掌柜 ${shops.length}、宗门 ${sects.map((s) => s.name).join('/')}、坐镇的城 ${cities.length}`);
}
// 同一界在另一份存档里也是同一批人：抹掉那一界的人，再落过去一次（落地时那一界的地形在用，和平时一样）
{
  const map = `realm-${land}` as any;
  const names = first.get(map)!;
  g.npcs.list = g.npcs.list.filter((n) => n.map !== map);
  const cap = W.locsOf(map).find((l) => l.hub === 'capital') ?? W.locsOf(map)[0];
  g.travel.pending = { map, x: cap.x * W.WORLD_SCALE, y: cap.y * W.WORLD_SCALE, via: 'portal' } as any;
  assert.ok(g.switchMap(map)); g.travel.pending = null;
  const now = g.npcs.list.filter((n) => n.map === map && n.id.startsWith('rf')).map((n) => n.name).join(',');
  assert.equal(now, names, '按种子撒：同一界永远是同一批人');
}
console.log('PASS 别界的人：' + lines.join('；'));
