// 施法动作连拍（Node + Skia）：同一套人物代码，对比「每帧走/施法来回切（原行为）」与「只设一次 cast（修正后）」。
// 用法：npx tsx tools/cast-strip.ts → tools/out/cast-strip.png（上排原行为，下排修正后；每格间隔 0.067s）
import { createCanvas } from './env';
import { writeFileSync, mkdirSync } from 'fs';
const { drawCharacter, CharState, HANLI_LOOK } = await import('../src/gfx/character');

const N = 9, W = 150, H = 230, dt = 1 / 60;
const c = createCanvas(W * N, H * 2), g = c.getContext('2d') as any;
g.fillStyle = '#e9e2cf'; g.fillRect(0, 0, W * N, H * 2);
for (const [row, old] of [[0, true], [1, false]] as const) {
  const st = new CharState(0, 0);
  st.faceToward(1, 0.4);
  st.setAction('walk');
  for (let i = 0; i < 30; i++) { st.speed = 120; st.update(dt); }
  let f = 0;
  for (let k = 0; k < N; k++) {
    for (let j = 0; j < 4; j++, f++) {
      if (old) st.setAction('walk');
      st.setAction('cast');
      st.speed = 120; st.update(dt);
      g.save(); g.translate(-10000, -10000); drawCharacter(g, HANLI_LOOK, st, 1, dt); g.restore();   // 推进物理但不显示
    }
    g.save(); g.translate(k * W + W / 2, row * H + H - 20); g.scale(1.25, 1.25);
    const s2 = st; const x0 = s2.x, y0 = s2.y; s2.x = 0; s2.y = 0;
    drawCharacter(g, HANLI_LOOK, s2, 1, 0);
    s2.x = x0; s2.y = y0; g.restore();
  }
  g.fillStyle = '#5a3a2a'; g.font = '14px serif'; g.fillText(old ? '原：每帧 walk→cast' : '修正：只设一次 cast', 6, row * H + 18);
}
mkdirSync(new URL('./out/', import.meta.url), { recursive: true });
writeFileSync(new URL('./out/cast-strip.png', import.meta.url), c.toBuffer('image/png'));
console.log('saved tools/out/cast-strip.png');
