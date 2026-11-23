// v0.71 设置项冒烟：自动运镜开关（飞行拉远 / 战斗取景 / 大招运镜）
//   npx tsx tools/test-camera.ts
const CW = 1280, CH = 800;
(globalThis as any).window = { innerWidth: CW, innerHeight: CH, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const store = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } };
(globalThis as any).sessionStorage = (globalThis as any).localStorage;
await import('./env');
const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const { REALMS } = await import('../src/data/realms');

let pass = 0, fail = 0;
const ok = (c: any, m: string) => { if (c) { pass++; console.log('ok   ', m); } else { fail++; console.log('FAIL ', m); } };

const terrain = new Terrain(); terrain.build();
const g = new Game(terrain);

console.log('一、默认开、可关、写进本地');
{
  ok(g.autoCam === true, '默认开启');
  g.setAutoCam(false);
  ok(g.autoCam === false && localStorage.getItem('fanren.autoCam') === '0', '关掉后写入 fanren.autoCam=0');
  ok(g.camLeanX === 0 && g.camLeanY === 0 && g.camFrameZ === 1, '关掉时立刻把镜头偏移归零');
  g.setAutoCam(true);
  ok(localStorage.getItem('fanren.autoCam') === '1', '再开写回 1');
}

console.log('二、新建 Game 会读回设置');
{
  g.setAutoCam(false);
  const g2 = new Game(terrain);
  ok(g2.autoCam === false, '关着退出，下次进来仍是关');
  g2.setAutoCam(true);
  const g3 = new Game(terrain);
  ok(g3.autoCam === true, '开着则读回开');
}

console.log('三、战斗取景受它控制');
{
  const mkFoe = () => ({ x: g.player.x + 260, y: g.player.y, dead: false, aggro: true, spar: false } as any);
  const run = (on: boolean) => {
    g.setAutoCam(on);
    g.hero.realm = 3; g.hero.stage = 0;
    g.player.st.moving = true; g.player.st.speed = REALMS[3].speed * 0.6;
    g.combat.lock = mkFoe();
    g.camLeanX = 0; g.camLeanY = 0; g.camFrameZ = 1;
    for (let i = 0; i < 30; i++) { try { g.update(1 / 60); } catch { /* 只关心镜头 */ } }
    return Math.abs(g.camLeanX) + Math.abs(g.camLeanY);
  };
  const off = run(false), on = run(true);
  ok(off < 0.5, `关闭时镜头不偏（偏移 ${off.toFixed(2)}）`);
  ok(on > off + 1, `开启时镜头偏向目标（偏移 ${on.toFixed(2)} > ${off.toFixed(2)}）`);
}

console.log('四、大招运镜也归它管');
{
  const run = (on: boolean) => {
    g.setAutoCam(on);
    g.cine = { t: 0, dur: 2, z: 1.8, x: g.player.x + 400, y: g.player.y, k: 0 } as any;
    g.camFrameZ = 1;
    for (let i = 0; i < 40; i++) { try { g.update(1 / 60); } catch { /* */ } }
    return g.camFrameZ;
  };
  const off = run(false), on = run(true);
  ok(Math.abs(off - 1) < 0.02, `关闭时不做大招运镜（camFrameZ ${off.toFixed(3)}）`);
  ok(on > 1.05 || on < 0.95, `开启时 camFrameZ 被推动（${on.toFixed(3)}）`);
}

console.log('五、飞行高度拉远也关掉');
{
  const run = (on: boolean) => {
    g.setAutoCam(on);
    g.cam.targetZoom = 1; g.cam.zoom = 1; g.alt = 1; g.camFrameZ = 1;
    for (let i = 0; i < 8; i++) { g.alt = Math.max(g.alt, 0.9); try { g.update(1 / 60); } catch { /* */ } }
    return g.cam.zoom;
  };
  const off = run(false), on = run(true);
  ok(Math.abs(off - 1) < 0.06, `关闭时缩放仍是你自己的 1.00（${off.toFixed(3)}）`);
  ok(on < off - 0.03, `开启时因高度被拉远（${on.toFixed(3)} < ${off.toFixed(3)}）`);
  g.setAutoCam(true);
}

console.log(`\n结果：通过 ${pass}，失败 ${fail}`);
if (fail) process.exit(1);
