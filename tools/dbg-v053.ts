// 临时：v053 玄武护身两击都是 0 伤害的根因探针
const CW = 1280, CH = 800;
(globalThis as any).window = { innerWidth: CW, innerHeight: CH, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const store = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } };
(globalThis as any).sessionStorage = (globalThis as any).localStorage;
(globalThis as any).__TAIXU_NORELOAD = true;
await import('./env');
const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const { LOCATIONS, WORLD_SCALE } = await import('../src/data/world');
const terrain = new Terrain(); terrain.build();
const g: any = new Game(terrain); g.reset();
const l = LOCATIONS.find((q: any) => q.id === 'qixuan')!;
{ let x = l.x * WORLD_SCALE + 900, y = l.y * WORLD_SCALE + 600;
  for (let r = 0; r < 20000 && (terrain.inLocZone(x, y, 1800) || terrain.walkFactor(x, y) <= 0); r += 400) { x += 400; y += 150; }
  g.teleport(x, y); }
g.paused = false; g.modal = null;
const tick = (sec: number) => { for (let i = 0; i < sec * 30; i++) { g.hero.hp = Math.max(g.hero.hp, 0.5); g.modal = null; g.update(1 / 30); } };
const c = g.combat, h = g.hero;
h.realm = 3; h.stage = 0; h.hp = 1; h.mp = 1;
c.enemies = []; c.acts.list = []; c.cds?.clear?.(); c.pst = {}; c.invulnT = 0;
if (!h.arts.some((a: any) => a.id === 'hx_gui')) h.arts.push({ id: 'hx_gui', xp: 0 });
tick(0.5);
const st = (tag: string) => console.log(tag, 'hp', h.hp.toFixed(3), 'dead', h.dead, 'invuln', c.invulnT, 'dead?', 'ling', JSON.stringify(c.lingdun.hp.map((v: number) => +v.toFixed(0))), 'want', c.lingdun.want, 'inCombat', c.inCombat, 'combatT', (c.combatT ?? 0).toFixed(1), 'acts', c.acts.list.length, 'gui', !!c.acts.list.find((a: any) => a.guarding), 'shield', c.shield, 'dash', c.dash, 'ni', typeof c.ni?.block);
st('before cast');
c.cast('hx_gui'); tick(0.5);
st('after cast+tick');
const hp0 = h.hp; c.hitPlayer(c.pStats.hp * 0.3, h.realm, undefined, g.player.x + 10, g.player.y);
console.log('hit1 lost', (hp0 - h.hp).toFixed(3));
st('after hit1');
c.acts.list = []; h.hp = 1; c.invulnT = 0;
const hp1 = h.hp; c.hitPlayer(c.pStats.hp * 0.3, h.realm, undefined, g.player.x + 10, g.player.y);
console.log('hit2 lost', (hp1 - h.hp).toFixed(3));
st('after hit2');
