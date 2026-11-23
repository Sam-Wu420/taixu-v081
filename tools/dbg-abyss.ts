import './env';
(globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const store: Record<string, string> = {};
(globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
(globalThis as any).sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const W = await import('../src/data/world');
const G = await import('../src/world/game');
const C = await import('../src/world/cultivation');
const { shoreField } = await import('../src/world/jueyuField');
const g = await G.createGame(() => {});
g.reset();
shoreField.ensure();
const p = g.player, J = g.jueyu, D = J.deep, S = g.seabeast, c = g.combat;
J.calm = true; S.off = true;
const CORE = { x: 668000, y: 150000 };
const place = (x: number, y: number) => { g.teleport(x, y); p.flying = false; p.z = p.zTarget = 0; c.reset(); J.reset(); if (g.modal) g.closeModal(true); };
place(CORE.x, CORE.y); J.swimming = true;
for (let i = 0; i < 2; i++) { g.input.keys.clear(); g.update(0.1); }
console.log('before dive: swimming', J.swimming, 'active', D.active, 'land', g.terrain.isLand(p.x, p.y), 'profile', !!(J.profile));
D.debugDive(2000); g.hero.hp = 1; g.hero.mp = 1; c.invulnT = 0;
console.log('after debugDive: active', D.active, 'd', D.d, 'floor', D.floor, 'ward', D.ward().toFixed(3), 'need', D.needAt(2000).toFixed(3));
for (let i = 0; i < 60; i++) {
  if (g.modal) g.closeModal(true); g.paused = false;
  g.input.keys.clear(); g.update(0.1);
  if (i % 10 === 9) console.log(i + 1, 'active', D.active, 'd', D.d.toFixed(0), 'hp', g.hero.hp.toFixed(4), 'hurt', (J.deep as any).hud?.hurt, 'land', g.terrain.isLand(p.x, p.y));
}
