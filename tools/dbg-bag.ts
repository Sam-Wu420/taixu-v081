import './env';
const store: Record<string, string> = {};
(globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
(globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };

const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const C = await import('../src/world/cultivation');

const terrain = new Terrain(); terrain.build();
const g = new Game(terrain);
g.hero = C.newHero(); C.addItem(g.hero, 'herb_zihou', 2, 50); C.addItem(g.hero, 'art_xuantie', 1);
console.log('before', JSON.stringify(g.hero.bag.map((b) => `${b.id}:${b.n}:${b.age ?? ''}`)));
console.log('save', g.save(1));
const raw = JSON.parse(store['taixu_save_1']!);
const ids = raw.hero.bag.map((b: any) => `${b.id}:${b.n}:${b.age ?? ''}`);
console.log('saved', JSON.stringify(ids));
for (const b of raw.hero.bag) delete b.pos;
raw.hero.hotbar[8] = 'pill:not_an_item';
store['taixu_save_1'] = JSON.stringify(raw);
const g2 = new Game(terrain);
console.log('load', g2.load('taixu_save_1'));
console.log('after ', JSON.stringify(g2.hero.bag.map((b) => `${b.id}:${b.n}:${b.age ?? ''}`)));
process.exit(0);
