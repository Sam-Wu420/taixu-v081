// 出角色快照（每档一张，放大到 520px 高），肉眼检查衣摆/腿部穿模
//   npx tsx tools/snap-character.ts
const CW = 420, CH = 620;
(globalThis as any).window = { innerWidth: CW, innerHeight: CH, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
(globalThis as any).localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { createCanvas, save } = await import('./env');
const { CharState, drawCharacter, HANLI_LOOK } = await import('../src/gfx/character');

const cases: [string, number][] = [['idle', 0], ['run', 260], ['sprint', 420]];
for (const [name, speed] of cases) {
  const cv: any = createCanvas(CW, CH);
  const ctx: any = cv.getContext('2d');
  ctx.fillStyle = '#efe6d0'; ctx.fillRect(0, 0, CW, CH);
  const st: any = new CharState(0, 0);
  st.action = speed > 0 ? 'run' : 'idle';
  st.gait = speed > 0 ? 'run' : null;
  st.vx = speed;
  const zs = 520 / 170;
  for (let k = 0; k < 90; k++) {
    st.speed = speed; st.t += 1 / 60; st.update(1 / 60);
    if (k === 89) { ctx.setTransform(zs, 0, 0, zs, CW / 2, 580); drawCharacter(ctx, HANLI_LOOK, st, 1, 1 / 60); }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#333'; ctx.font = '16px sans-serif'; ctx.fillText(`${name} ${speed}`, 12, 26);
  save(cv, `char-${name}.png`);
}
