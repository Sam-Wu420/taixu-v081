import './env';
(globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const store: Record<string, string> = {};
(globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
(globalThis as any).sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
(globalThis as any).__TAIXU_NORELOAD = true;
await import('./fixed-clock');
let s0 = 7; Math.random = () => { s0 = (Math.imul(s0, 1664525) + 1013904223) >>> 0; return s0 / 4294967296; };
const G = await import('../src/world/game');
const { Enemy } = await import('../src/world/combat');
const { ENEMIES } = await import('../src/data/enemies');
const g = await G.createGame(() => {}); g.reset();
const c = g.combat as any, p = g.player, h = g.hero, B = c.brawl;
h.realm = 3; h.stage = 1;
const T = g.terrain as any;
T.walkFactor = () => 1; T.canTraverse = () => true; T.isLand = () => true;
(g.npcs as any).prestep = () => {};
(g as any).space.blocked = () => false;
c.safeAt = () => false; c.spawnT = 1e9;
B.brk.manual = true;
const calm = () => { if (g.modal) g.closeModal(true); g.paused = false; };
const frame = (dt = 1/60) => { if (g.modal) g.closeModal(true); g.paused = false; c.spawnT = 1e9; g.update(dt); c.fxq.length = 0; };
const run = (sec: number) => { for (let t = 0; t < sec; t += 1/60) frame(); };
const fresh = () => { c.enemies.length = 0; B.reset(); c.cds.clear(); c.invulnT = 0; h.hp = 1; h.mp = 1; B.log = []; c.lock = null; c.manual = false; p.flying = false; p.z = 0; };
const foe = (dx: number, realm = 2, id = 'yelang') => { const e = new Enemy({ ...ENEMIES[id], speed: 0, melee: undefined, ranged: undefined }, p.x + dx, p.y, realm, 1); e.maxHp = e.hp = 1e7; e.aggro = true; c.enemies.push(e); return e; };
const waitHit = (n: number, max = 1) => { for (let t = 0; t < max && B.log.length < n; t += 1/60) frame(); };
const j0 = g.juice.bind(g);
(g as any).juice = (stop: number, shake: number) => { if (stop > 0) console.log('JUICE', stop, shake, new Error().stack!.split('\n').slice(2, 7).join('\n   ')); return j0(stop, shake); };
const hp0 = c.hitPlayer.bind(c);
(c as any).hitPlayer = (...a: any[]) => { console.log('HITPLAYER raw', a[0]?.toFixed?.(3), 'stack', new Error().stack!.split('\n').slice(2, 6).join('\n   ')); return hp0(...a); };
// —— 先跑第 1 段，和正式测试一样消耗随机数
{
  fresh();
  const e1 = foe(1200); c.lock = e1; c.manual = true;
  (calm(), B.rush());
  let frames = 0; while (!B.log.map((l: any) => l.k).includes('rush') && frames < 60) { frame(); frames++; }
  console.log('section1 rush', frames, 'hitStop', g.hitStop);
}
fresh(); run(0.1);
const e = foe(90, 3);
for (let i = 0; i < 4; i++) {
  (calm(), B.light()); waitHit(i + 1, 0.6);
  console.log('after punch', i + 1, 'kinds', B.log.map((l: any) => l.k), 'hitStop', g.hitStop, 'hp', h.hp.toFixed(3), 'foe skT', e.skT.toFixed(2), 'cast', e.cast?.id ?? e.cast?.sk?.id ?? null);
  run(0.2);
}
