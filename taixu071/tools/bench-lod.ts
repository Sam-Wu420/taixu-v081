// 角色 LOD 微基准（同一段代码在两个仓库各跑一次，比的就是 character.ts 的绘制开销）
// 用法：npx tsx tools/bench-lod.ts
// 量的是"屏幕上这个人有多高（px）→ 画一个人要多少 ms"，不含渲染器/场景/上传。
const CW = 1280, CH = 800;
(globalThis as any).window = { innerWidth: CW, innerHeight: CH, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
(globalThis as any).localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { createCanvas } = await import('./env');
const { CharState, drawCharacter, HANLI_LOOK } = await import('../src/gfx/character');

const cv: any = createCanvas(CW, CH);
const ctx: any = cv.getContext('2d');
const N = 20;
const look = HANLI_LOOK;
const states = Array.from({ length: N }, (_, i) => { const s = new CharState(60 + (i % 5) * 60, 120); s.yaw = i * 0.7; s.action = 'walk'; s.gait = 'walk'; s.t = i * 0.37; return s; });

function run(hpx: number, iters: number) {
  const zs = hpx / 170;                      // 170 局部单位 ≈ 一个人高 → 屏幕高度 hpx
  for (const s of states) s.update(1 / 60);
  const t0 = process.hrtime.bigint();
  for (let k = 0; k < iters; k++) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, CW, CH);
    ctx.setTransform(zs, 0, 0, zs, 0, 0);
    for (const s of states) drawCharacter(ctx, look, s, 1, 1 / 60);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return Number(process.hrtime.bigint() - t0) / 1e6 / iters;
}

const rows: { hpx: number; ms: number }[] = [];
for (const hpx of [16, 24, 40, 64, 96, 160, 300]) {
  run(hpx, 3);                                // 预热（布料/弹簧先跑起来）
  const ms = run(hpx, 25);
  rows.push({ hpx, ms });
  console.log(`${String(hpx).padStart(4)}px 高：${N} 人一帧 ${ms.toFixed(2)} ms　单人 ${(ms / N).toFixed(3)} ms`);
}
console.log('\n=== JSON ===');
console.log(JSON.stringify(rows.map((r) => ({ hpx: r.hpx, per: +(r.ms / N).toFixed(4) }))));
