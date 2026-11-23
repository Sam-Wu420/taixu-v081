// 量一下：衣摆（裙子）在速度 0 / 中速 / 极速时的实际外形
//   npx tsx tools/probe-hem.ts
// 做法：同一个角色、同一屏幕高度，跑够帧数后把画面扫一遍，取「下身区域」的墨迹包围盒与墨迹量。
const CW = 420, CH = 420;
(globalThis as any).window = { innerWidth: CW, innerHeight: CH, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
(globalThis as any).localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { createCanvas } = await import('./env');
const { CharState, drawCharacter, HANLI_LOOK } = await import('../src/gfx/character');

const cv: any = createCanvas(CW, CH);
const ctx: any = cv.getContext('2d');

function measure(speed: number) {
  const st: any = new CharState(0, 0);
  st.action = speed > 0 ? 'run' : 'idle';
  st.gait = speed > 0 ? 'run' : null;
  st.vx = speed; st.vy = 0;
  const zs = 240 / 170;                       // 屏上 240px 高，缩放固定
  for (let i = 0; i < 120; i++) {
    st.speed = speed; st.t += 1 / 60; st.x += speed / 60; st.update(1 / 60);   // 真的往前走
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, CW, CH);
    // 相机跟着人走：脚始终落在 (CW/2, 380)，但锚点在世界里移动——这样才量得到「衣摆拖在后面」
    ctx.setTransform(zs, 0, 0, zs, CW / 2 - st.x * zs, 380 - st.y * zs);
    drawCharacter(ctx, HANLI_LOOK, st, 1, 1 / 60);
  }
  const img = ctx.getImageData(0, 0, CW, CH).data;
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, ink = 0;
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    const a = img[(y * CW + x) * 4 + 3];
    if (a > 24) { ink++; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  return { speed, w: maxX - minX, h: maxY - minY, ink, minY, maxY, hem: (st as any).hemExtent ?? 0 };
}

console.log('速度 → 角色整体墨迹包围盒（同一绘制高度 240px）与衣摆最远沿');
for (const v of [0, 100, 200, 300, 400]) {
  const m = measure(v);
  console.log(`  speed ${String(v).padStart(3)}：宽 ${String(m.w).padStart(3)}px · 高 ${String(m.h).padStart(3)}px · 墨迹 ${String(m.ink).padStart(6)} · 衣摆沿 ${m.hem.toFixed(2)}`);
}
