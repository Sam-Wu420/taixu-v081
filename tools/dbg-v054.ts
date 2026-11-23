// 临时：v054 野狼/劫修互斗 0 伤害探针（第二版：看招式落点与结算）
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
const { ENEMIES } = await import('../src/data/enemies') as any;
const { Enemy } = await import('../src/world/combat');
const terrain = new Terrain(); terrain.build();
const g: any = new Game(terrain); g.reset();
const l = LOCATIONS.find((q: any) => q.id === 'qixuan')!;
{ let x = l.x * WORLD_SCALE + 900, y = l.y * WORLD_SCALE + 600;
  for (let r = 0; r < 20000 && (terrain.inLocZone(x, y, 1800) || terrain.walkFactor(x, y) <= 0); r += 400) { x += 400; y += 150; }
  g.teleport(x, y); }
g.paused = false; g.modal = null;
const mk = (id: string, dx: number, dy: number) => { const e = new Enemy(ENEMIES[id], g.player.x + dx, g.player.y + dy, 1, 2); e.hx = e.x; e.hy = e.y; g.combat.enemies.push(e); return e; };
const C = g.combat;
const origHit = C.tankHit.bind(C);
C.tankHit = (t: any, raw: number, realm: number, status: any, fx: number, fy: number, e: any) => { if (t?.k === 'foe' || e?.name === '青背苍狼') console.log('    tankHit src', e?.name, '->', t?.k, t?.ref?.name, 'raw', raw.toFixed(1), 'dist', Math.hypot(t.x - fx, t.y - fy).toFixed(0)); return origHit(t, raw, realm, status, fx, fy, e); };
C.enemies = []; C.invulnT = 999;
const bandit = mk('bandit', 500, 0); bandit.aggro = true; bandit.maxHp = bandit.hp = 1e5;
const wolf = mk('wolf', 760, 0); wolf.maxHp = wolf.hp = 1e5;
console.log('wolf melee', JSON.stringify(wolf.def.melee), 'ranged', JSON.stringify(wolf.def.ranged), 'atk', wolf.atk, 'blv', wolf.blv);
let seen = 0;
for (let i = 0; i < 30 * 8; i++) {
  g.hero.hp = 1; g.modal = null; g.update(1 / 30);
  const hz = C.foe.hz;
  if (hz.length > seen) { for (let k = seen; k < hz.length; k++) { const h = hz[k]; console.log('    HZ', i, h.src?.name, h.k, 'x', Math.round(h.x), 'y', Math.round(h.y), 'r', h.r, 'dmg', h.dmg?.toFixed(1), 'fired', h.fired, 't', h.t.toFixed(2)); } seen = hz.length; }
  if (i % 30 === 29) console.log('sec', ((i + 1) / 30) | 0, 'bandit', bandit.hp, 'wolf', wolf.hp, 'wolfCast', wolf.cast?.sk?.id, 'castT', wolf.cast?.t?.toFixed(2), 'wolfTank', wolf.tgE?.name, 'dist', Math.hypot(wolf.x - bandit.x, wolf.y - bandit.y).toFixed(0), 'hpNow', hz.filter((h: any) => !h.fired).map((h: any) => h.k + '@' + Math.round(h.x) + ',' + Math.round(h.y)).join(' '));
}
