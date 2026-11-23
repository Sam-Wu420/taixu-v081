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
const p = g.player, J = g.jueyu, D = J.deep, S = g.seabeast, c = g.combat as any;
J.calm = true; S.off = true;
g.hero.realm = 4; g.hero.stage = 0;
const CORE = { x: 668000, y: 150000 };
const place = (x: number, y: number) => { g.teleport(x, y); p.flying = false; p.z = p.zTarget = 0; c.reset(); J.reset(); if (g.modal) g.closeModal(true); };
const run = (frames: number) => { for (let i = 0; i < frames; i++) { if (g.modal) g.closeModal(true); g.paused = false; g.input.keys.clear(); g.update(0.1); } };
// 先像测试一样潜下去再浮上来
place(CORE.x, CORE.y); J.swimming = true; run(30);
g.input.keys.clear(); g.input.keys.add('descend'); run(30); g.input.keys.clear();
g.hero.hp = 1; g.hero.mp = 1;
const hp0 = c.hitPlayer.bind(c);
(c as any).hitPlayer = (...a: any[]) => { console.log('  hitPlayer raw', a[0]?.toFixed?.(2), 'active', D.active, 'd', D.d?.toFixed?.(0), 'invuln', c.invulnT, 'ni', !!c.ni, 'lingdun', c.lingdun?.layers, 'shield', !!c.shield); return hp0(...a); };
// 水压段
place(CORE.x, CORE.y); J.swimming = true; run(2);
D.debugDive(2000); g.hero.hp = 1; g.hero.mp = 1; c.invulnT = 0;
console.log('start: active', D.active, 'd', D.d.toFixed(0), 'ward', D.ward().toFixed(3), 'need', D.needAt(2000).toFixed(3), 'invuln', c.invulnT);
for (let i = 0; i < 60; i++) {
  if (g.modal) g.closeModal(true); g.paused = false;
  g.input.keys.clear(); g.update(0.1); g.hero.mp = Math.max(g.hero.mp, 0.5);
  if (i % 5 === 4) console.log(i + 1, 'hp', g.hero.hp.toFixed(4), 'invuln', c.invulnT.toFixed(2), 'hurtAcc', (D as any).hurtAcc?.toFixed?.(4), 'active', D.active, 'd', D.d.toFixed(0));
}
