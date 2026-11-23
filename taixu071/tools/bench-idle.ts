// 面板打开（paused）时主循环还剩多少活：update 每帧耗时 / 一堆 UI 订阅者的重渲染
// 用法：npx tsx tools/bench-idle.ts
const CW = 1280, CH = 800;
(globalThis as any).window = { innerWidth: CW, innerHeight: CH, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const store = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } };
(globalThis as any).sessionStorage = (globalThis as any).localStorage;
await import('./env');
const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');

const terrain = new Terrain(); terrain.build();
const g = new Game(terrain);
const ms = (f: () => void, n = 60) => { const t0 = process.hrtime.bigint(); for (let i = 0; i < n; i++) f(); return Number(process.hrtime.bigint() - t0) / 1e6 / n; };

for (let i = 0; i < 240; i++) g.update(1 / 60);           // 预热：让附近的人、天气、粒子都起来
console.log(`附近活人 ${g.npcs.active?.size ?? '?'} 个`);

g.paused = false;
console.log(`运行中 update  ${ms(() => g.update(1 / 60)).toFixed(3)} ms/帧`);
g.paused = true;
console.log(`面板打开 update  ${ms(() => g.update(1 / 60)).toFixed(3)} ms/帧`);
console.log(`updateUI(true)   ${ms(() => g.updateUI(true)).toFixed(3)} ms/次`);
