// 临时：v0542 元婴敌修自己不出化形/出窍 探针
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
const { kitOf } = await import('../src/world/foeskills');
const terrain = new Terrain(); terrain.build();
const g: any = new Game(terrain); g.reset();
const l = LOCATIONS.find((q: any) => q.id === 'qixuan')!;
{ let x = l.x * WORLD_SCALE + 900, y = l.y * WORLD_SCALE + 600;
  for (let r = 0; r < 20000 && (terrain.inLocZone(x, y, 1800) || terrain.walkFactor(x, y) <= 0); r += 400) { x += 400; y += 150; }
  g.teleport(x, y); }
g.paused = false; g.modal = null;
g.hero.realm = 3; g.hero.stage = 1; g.combat.invulnT = 99;
const old3 = new Enemy(ENEMIES.jindan_mo, g.player.x + 360, g.player.y, 4, 1);
old3.name = '老魔戊'; old3.aggro = true; old3.maxHp = old3.hp = 1e6; old3.skT = 0; g.combat.enemies.push(old3);
console.log('kit', kitOf(old3).map((s: any) => s.id + (s.hx ? '(hx)' : '') + (s.k === 'ying' ? '(ying)' : '')).join(' '));
console.log('gear', (old3 as any).gear ? 'yes' : 'no', 'gearOn', (old3 as any).gearOn, 'ward', (old3 as any).ward);
let lastSk = '', maxSpirits = 0, sawY = false, seenYing = false;
for (let i = 0; i < 40 * 30; i++) {
  old3.hp = old3.maxHp * 0.6; g.modal = null; g.hero.hp = 1; g.update(1 / 30);
  const sk = old3.cast?.sk?.id ?? '';
  if (sk && sk !== lastSk) { lastSk = sk; console.log('t', (i / 30).toFixed(1), 'cast', sk, 'dist', Math.hypot(old3.x - g.player.x, old3.y - g.player.y).toFixed(0), 'spirits', g.shen.spirits.length); }
  maxSpirits = Math.max(maxSpirits, g.shen.spirits.length);
  if (!seenYing && (old3 as any).ying) { seenYing = true; console.log('t', (i / 30).toFixed(1), 'YING out!'); }
  sawY ||= !!(old3 as any).ying;
  if (i % 300 === 299) console.log('t', (i / 30) | 0, 'skCd', JSON.stringify(old3.skCd), 'tank', old3.tgE?.name ?? (old3.tgP ? 'player' : '?'), 'skT', old3.skT?.toFixed(2));
}
console.log('result sawY', sawY, 'maxSpirits', maxSpirits, 'spiritsNow', g.shen.spirits.length, 'ying', !!(old3 as any).ying);
