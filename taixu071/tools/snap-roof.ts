// 「只画屋顶色块」长什么样：同一座小村，按不同缩放高度画出来对比
//   npx tsx tools/snap-roof.ts   → tools/out/roof-blocks.png
const CW = 1520, CH = 740;
const { createCanvas } = await import('./env');           // 必须先初始化 document/画布工厂
const { renderPiece } = await import('../src/gfx/building');

const cv: any = createCanvas(CW, CH);
const g: any = cv.getContext('2d');
g.fillStyle = '#efe6cf'; g.fillRect(0, 0, CW, CH);
g.font = '15px sans-serif';

const pal = { roof: '#4a5868', wall: '#ece4d0', pillar: '#8a2e24', trim: '#5a3a28', stone: '#bdb6a4', accent: '#c89a3a', ground: '#d8ccaa' };
const town = [
  { kind: 'house', dx: -160, dy: 0, w: 96, h: 86 },
  { kind: 'house', dx: -50, dy: 20, w: 88, h: 80 },
  { kind: 'hut', dx: 40, dy: 8, w: 70, h: 62 },
  { kind: 'hall', dx: 150, dy: -12, w: 160, h: 130 },
  { kind: 'tower', dx: 258, dy: 24, w: 70, h: 150 },
];
const sprites = town.map((t) => ({ t, spr: renderPiece({ kind: t.kind, x: 0, y: 0, seed: 12345, p: { w: t.w, h: t.h } } as any, pal as any, 1, 1 as any) as any }));

/** 现在：整张精灵缩到目标高度（细节全都还在，只是被压缩） */
function drawSprite(cx: number, cy: number, h: number) {
  const k = h / 120;
  for (const { t, spr } of sprites) {
    if (!spr?.canvas) continue;
    const w = spr.w * k, hh = spr.h * k;
    g.drawImage(spr.canvas, cx + t.dx * k - w / 2, cy + t.dy * k - hh, w, hh);
  }
}
/** 提议：远景只画「墙块 + 屋顶梯形 + 一道屋檐暗线」 */
function drawBlocks(cx: number, cy: number, h: number, k4 = 1) {
  const k = (h / 120) * k4;
  for (const t of town) {
    const w = t.w * k, hh = t.h * k, x = cx + t.dx * k, y = cy + t.dy * k;
    g.fillStyle = pal.wall;
    g.fillRect(x - w * 0.36, y - hh * 0.5, w * 0.72, hh * 0.5);
    g.fillStyle = pal.roof;
    g.beginPath();
    g.moveTo(x - w * 0.30, y - hh * 0.94);
    g.lineTo(x + w * 0.30, y - hh * 0.94);
    g.lineTo(x + w * 0.52, y - hh * 0.50);
    g.lineTo(x - w * 0.52, y - hh * 0.50);
    g.closePath(); g.fill();
    g.strokeStyle = 'rgba(30,26,22,0.5)'; g.lineWidth = Math.max(0.5, hh * 0.05);
    g.beginPath(); g.moveTo(x - w * 0.52, y - hh * 0.5); g.lineTo(x + w * 0.52, y - hh * 0.5); g.stroke();
  }
}

const rows: { labelY: number; label: string; draw: () => void }[] = [
  { labelY: 26, label: 'NOW  sprite @160px  (near / mid view: all detail)', draw: () => drawSprite(380, 250, 160) },
  { labelY: 300, label: 'NOW  sprite @50px   (far: already mush)', draw: () => drawSprite(380, 390, 50) },
  { labelY: 430, label: 'NOW  sprite @16px   (very far: a few grey pixels)', draw: () => drawSprite(380, 470, 16) },
  { labelY: 512, label: 'PROPOSAL  blocks @16px  (silhouette survives)', draw: () => drawBlocks(380, 552, 16) },
  { labelY: 616, label: 'PROPOSAL  blocks @16px, zoomed 6x', draw: () => drawBlocks(1060, 700, 16, 6) },
];
for (const r of rows) {
  g.fillStyle = '#3a3226'; g.fillText(r.label, 22, r.labelY);
  g.strokeStyle = 'rgba(58,50,38,0.15)';
  g.beginPath(); g.moveTo(22, r.labelY + 12); g.lineTo(CW - 22, r.labelY + 12); g.stroke();
  r.draw();
}

const fs = await import('node:fs');
fs.mkdirSync('tools/out', { recursive: true });
fs.writeFileSync('tools/out/roof-blocks.png', cv.toBuffer('image/png'));
console.log('saved tools/out/roof-blocks.png');
