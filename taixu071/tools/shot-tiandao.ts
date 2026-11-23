// v0.51.3 视觉验收：前世之碑 + 灵草争夺对手，同帧真实渲染（node 环境跑 Game.update + Renderer.render）
// 用法: npx tsx tools/shot-tiandao.ts
import { createCanvas, save } from './env';
const CW = 1280, CH = 800;
const store = new Map<string, string>();
(globalThis as any).window = { innerWidth: CW, innerHeight: CH, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
(globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } };
(globalThis as any).__FANREN_NORELOAD = true;
const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const { Renderer } = await import('../src/world/render');
const C = await import('../src/world/cultivation');
const { LOCATIONS, WORLD_SCALE } = await import('../src/data/world');
const { sprites } = await import('../src/gfx/sprites');
sprites.frameMs = 1e9; (sprites as any).unlimited = true;
const terrain = new Terrain(); terrain.build();
const g = new Game(terrain);
const cv: any = createCanvas(CW, CH); cv.clientWidth = CW; cv.clientHeight = CH;
cv.getBoundingClientRect = () => ({ left: 0, top: 0, width: CW, height: CH });
g.canvas = cv; g.renderer = new Renderer(g, cv); (g as any).paused = false;
g.reset();
g.daoxin.setTier('tiandao');
g.hero.realm = 2; g.hero.stage = 2; g.hero.age = 137; g.hero.kills = 41;
C.addItem(g.hero, 'mat_lingshi', 4200); C.addItem(g.hero, 'art_chiyan', 1); C.addItem(g.hero, 'herb_zihou', 2);
// 找一处远离城镇的荒野作为陨落之地
let sx = 12000, sy = 9000;
for (let i = 0; i < 8000; i++) {
  const x = 3000 + Math.random() * 26000, y = 3000 + Math.random() * 17000;
  if (!terrain.isLand(x, y) || terrain.walkFactor(x, y) < 0.5) continue;
  if (LOCATIONS.some((l) => l.map === 'tiannan' && Math.hypot(l.x * WORLD_SCALE - x, l.y * WORLD_SCALE - y) < 4200)) continue;
  sx = x; sy = y; break;
}
g.teleport(sx, sy);
const s = g.daoxin.onTrueDeath('血手人屠·赵无忌', '死敌补刀，斩草除根');
g.closeModal(true);
g.hero.dead = false;
g.reset();                          // 转世：seedLegacy 把碑与凶手（带着储物袋）放进这一世
g.teleport(s.x + 30, s.y + 130);    // 站在碑前
g.cam.zoom = g.cam.targetZoom = 0.9;
g.day = 120; g.clock = 0.82 * 240;  // 暮色：碑前孤魂香一点最清楚
g.revealAll = true;
// 同帧再拉一场灵草争夺（碑右侧的空地上）
g.ws.dao!.contest = -999;
const old = Math.random; Math.random = (() => 0.02) as any;
g.daoxin.contestGather({ key: 'shot', kind: 'herb', item: 'herb_zihou', x: s.x + 420, y: s.y + 60, rare: true, seed: 7 } as any, [{ item: 'herb_zihou', n: 3, age: 160 }]);
Math.random = old;
g.closeModal(true);
const t0 = Date.now();
for (let i = 0; i < 6; i++) { g.update(1 / 30); g.renderer.render(1 / 30); }
console.log('render 6 frames', Date.now() - t0, 'ms; stele@', s.x, s.y, 'contests', g.daoxin.contests.length, 'steleFocus', !!g.daoxin.steleFocus, 'marks', JSON.stringify(g.daoxin.marks().map((m) => m.glyph)));
save(cv, 'tiandao-stele.png');
