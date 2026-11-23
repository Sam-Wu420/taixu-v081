// 侧身检查：同一速度、不同朝向（yaw）各出一张，看腿有没有从裙侧穿出
const CW = 460, CH = 620;
(globalThis as any).window = { innerWidth: CW, innerHeight: CH, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
(globalThis as any).localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { createCanvas, save } = await import('./env');
const { CharState, drawCharacter, HANLI_LOOK } = await import('../src/gfx/character');
const yaws = [0, Math.PI / 4, Math.PI / 2, Math.PI * 0.75, Math.PI];
const cv: any = createCanvas(CW * yaws.length, CH); const ctx: any = cv.getContext('2d');
ctx.fillStyle = '#efe6d0'; ctx.fillRect(0, 0, CW * yaws.length, CH);
const zs = 430 / 170;
yaws.forEach((yaw, i) => {
  const st: any = new CharState(0, 0);
  st.action = 'run'; st.gait = 'run'; st.vx = 260; st.yaw = st.targetYaw = yaw;
  for (let k = 0; k < 90; k++) {
    st.speed = 260; st.t += 1 / 60; st.yaw = st.targetYaw = yaw; st.update(1 / 60);
    if (k === 89) { ctx.setTransform(zs, 0, 0, zs, (i + 0.5) * CW, 560); drawCharacter(ctx, HANLI_LOOK, st, 1, 1 / 60); }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#333'; ctx.font = '15px sans-serif';
  ctx.fillText(`${Math.round((yaw / Math.PI) * 180)}deg`, i * CW + 10, 22);
});
save(cv, 'char-yaw.png');