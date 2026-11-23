const CW = 620, CH = 300;
const { createCanvas } = await import('./env');
const m: any = await import('../src/gfx/character');
const cv: any = createCanvas(CW, CH); const g: any = cv.getContext('2d');
g.fillStyle = '#e8dcc4'; g.fillRect(0,0,CW,CH);
const rows = [0.12, 0.08, 0.05];
let y = 80;
for (const zs of rows) {
  // 1:1
  let st: any = new (m.CharState as any)(); st.x = 0; st.y = 0; st.t = 1; st.update(1/60);
  g.save(); g.setTransform(zs, 0, 0, zs, 40, y); m.drawCharacter(g, m.HANLI_LOOK, st, 1, 1/60); g.restore();
  // 4x 放大看形状
  st = new (m.CharState as any)(); st.x = 0; st.y = 0; st.t = 1; st.update(1/60);
  g.save(); g.setTransform(zs*6, 0, 0, zs*6, 260, y); m.drawCharacter(g, m.HANLI_LOOK, st, 1, 1/60); g.restore();
  g.fillStyle = '#3a3226'; g.font = '13px sans-serif';
  g.fillText(Math.round(92*zs) + 'px（1:1）', 20, y + 16);
  g.fillText('×6 放大看形状', 240, y + 16);
  y += 95;
}
const fs = await import('node:fs');
fs.writeFileSync('tools/out/char-mini.png', cv.toBuffer('image/png'));
console.log('saved');