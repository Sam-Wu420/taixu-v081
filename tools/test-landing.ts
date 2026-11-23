// 第六轮返工：地点的落脚处是安全的——沧溟海归墟殿岛上，八级紫翅雷雕原来把刚落地的结丹期一照面就秒杀。
// 一、刷怪避开落脚处（按妖兽的察觉半径往外让）：站在落脚处跑一分钟，落脚处六百以内不新刷妖兽（召唤出来的小妖不算）；
// 二、落地保护：刚传送到落脚处的几息里，旁边已经在的高阶妖兽不主动扑上来；保护过了、或自己先出手，照常；
// 三、走开到别处（不在落脚处）照常刷、照常被扑。用真实的 Game 无界面地跑：npx tsx tools/test-landing.ts
import './env';
import assert from 'node:assert/strict';

(globalThis as any).__TAIXU_MAP = 'luanxing';
(globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const store: Record<string, string> = {};
(globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
(globalThis as any).sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
await import('./fixed-clock');
let seed0 = 17; Math.random = () => { seed0 = (Math.imul(seed0, 1664525) + 1013904223) >>> 0; return seed0 / 4294967296; };

const W = await import('../src/data/world');
const G = await import('../src/world/game');
assert.equal(W.ACTIVE_MAP, 'luanxing');
const g = await G.createGame(() => {});
g.reset();
const p = g.player, c = g.combat, S = W.WORLD_SCALE;
const xt = W.LOC_BY_ID.get('xutian')!;
const X = xt.x * S, Y = xt.y * S;
const log = (s: string) => console.log('  ' + s);
const run = (n: number, each?: (i: number) => void) => { for (let i = 0; i < n; i++) { if (g.modal) g.closeModal(true); g.paused = false; g.update(0.1); each?.(i); } };
const setJiedan = () => { g.hero.realm = 3; g.hero.stage = 0; g.hero.hp = 1; g.hero.mp = 1; g.hero.dead = false; };
let hits = new Map<unknown, number>(), frame = 0;
const hp0 = c.hitPlayer.bind(c);
(c as any).hitPlayer = (raw: number, r: number, st: any, fx: number, fy: number, src?: any) => { if (src && !hits.has(src)) hits.set(src, frame); return hp0(raw, r, st, fx, fy, src); };

// 一、刷怪避开落脚处
{
  setJiedan(); c.enemies.length = 0;
  g.teleport(X, Y); p.flying = false;
  const seen = new Set<unknown>(); let near = 0, total = 0;
  run(600, () => { g.hero.hp = 1; c.invulnT = 99; p.x = X; p.y = Y; for (const e of c.enemies) { if (seen.has(e)) continue; seen.add(e); if (e.dead || e.minion || e.def.kind === 'human') continue; total++; if (Math.hypot(e.x - X, e.y - Y) < 600) near++; } });
  assert.equal(near, 0, `归墟殿落脚处六百以内不新刷妖兽：${near} / ${total}`);
  assert.ok(c.nearLanding(X, Y, 600) && !c.nearLanding(X + 9000, Y + 9000, 600), '认得出落脚处');
  log(`站在归墟殿落脚处一分钟：刷了 ${total} 只，六百以内 0 只`);
}

// 二、落地保护：落脚处旁边九百有一只紫翅雷雕（察觉一千），刚传送过来的六息里它不扑、不放远招
{
  setJiedan(); c.enemies.length = 0;
  g.teleport(X + 30000, Y); run(5);
  const e = c.debugSpawn('zichidiao', X + 900, Y)!; e.aggro = false;
  hits = new Map(); frame = 0;
  g.teleport(X, Y); p.flying = false;
  assert.ok(c.landT > 5, `传送落地给了落地保护：${c.landT}`);
  let aggroed = -1;
  run(55, (i) => { frame = i; g.hero.hp = 1; p.x = X; p.y = Y; if (aggroed < 0 && e.aggro) aggroed = i; });
  assert.ok(!hits.has(e) && !e.aggro, `落地保护里紫翅雷雕不扑：aggro=${e.aggro} 第 ${aggroed} 帧`);
  // 保护过了：照常察觉、扑上来
  run(120, (i) => { frame = 55 + i; g.hero.hp = 1; c.invulnT = 99; p.x = X; p.y = Y; });
  assert.ok(e.aggro, '保护过了就照常察觉');
  log(`落地保护：头 5.5 息紫翅雷雕不扑；过后第 ${[...hits.values()][0] ?? '—'} 帧起照常动手`);
  // 自己先出手就不护着
  setJiedan(); c.enemies.length = 0;
  g.teleport(X + 30000, Y); run(5);
  const e2 = c.debugSpawn('zichidiao', X + 700, Y)!; e2.aggro = false;
  g.teleport(X, Y); p.flying = false; run(2);
  c.castT = 0.3; run(1);
  assert.equal(c.landT, 0, '自己施法就不再有落地保护');
}

// 三、不在落脚处：保护不起作用（照常被扑）
{
  setJiedan(); c.enemies.length = 0;
  const fx = X + 30000, fy = Y;
  g.teleport(fx, fy); p.flying = false;
  const e = c.debugSpawn('zichidiao', fx + 600, fy)!; e.aggro = false;
  run(20, () => { g.hero.hp = 1; c.invulnT = 99; p.x = fx; p.y = fy; });
  assert.ok(e.aggro || c.nearLanding(fx, fy, 700), '离落脚处远的地方照常被察觉');
  log('别处照常：落地保护只在地点的落脚处');
}
console.log('PASS 落脚处安全：刷怪避开落脚处、落地保护几息、出手即止、别处照常');
process.exit(0);
