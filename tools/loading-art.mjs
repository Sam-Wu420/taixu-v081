// r10：加载画面的三张贴图（用户的 our-codex-image MCP 生成，tools/codex-image.mjs）→ 裁切、缩放、压成 webp 放进 src/assets/loading/。
// 用法：node tools/loading-art.mjs <生成图所在目录>　　需要 ld_hero.png（御剑剪影，透明底）、ld_cloud.png（云带，透明底）、ld_far.png（宣纸远山）
import { loadImage, createCanvas } from '@napi-rs/canvas';
import { writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const src = process.argv[2]; if (!src) { console.error('用法：node tools/loading-art.mjs <目录>'); process.exit(1); }
const out = 'src/assets/loading'; mkdirSync(out, { recursive: true });
/** 透明像素包围盒（alpha > th） */
function bbox(img, th = 8) {
  const c = createCanvas(img.width, img.height), x = c.getContext('2d'); x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, img.width, img.height).data; let x0 = img.width, y0 = img.height, x1 = 0, y1 = 0;
  for (let y = 0; y < img.height; y++) for (let i = 0; i < img.width; i++) if (d[(y * img.width + i) * 4 + 3] > th) { if (i < x0) x0 = i; if (i > x1) x1 = i; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return { x0, y0, x1, y1 };
}
async function make(name, file, fn, q) {
  const img = await loadImage(join(src, file)); const { c } = fn(img);
  const f = join(out, name); writeFileSync(f, c.encodeSync('webp', q)); console.log(`${f}  ${c.width}×${c.height}  ${(statSync(f).size / 1024).toFixed(1)} KB`);
}
// 御剑剪影：裁到人和剑（四周留一点边），长边 1100
await make('hero.webp', 'ld_hero.png', (img) => {
  const b = bbox(img), pad = 12, sx = Math.max(0, b.x0 - pad), sy = Math.max(0, b.y0 - pad), sw = Math.min(img.width, b.x1 + pad) - sx, sh = Math.min(img.height, b.y1 + pad) - sy;
  const k = 1100 / Math.max(sw, sh), c = createCanvas(Math.round(sw * k), Math.round(sh * k)); c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height); return { c };
}, 84);
// 云带：只留有云的那一条（上下裁掉空白），宽 1600
await make('cloud.webp', 'ld_cloud.png', (img) => {
  const b = bbox(img, 4), pad = 8, sy = Math.max(0, b.y0 - pad), sh = Math.min(img.height, b.y1 + pad) - sy;
  const k = 1600 / img.width, c = createCanvas(1600, Math.round(sh * k)); c.getContext('2d').drawImage(img, 0, sy, img.width, sh, 0, 0, c.width, c.height); return { c };
}, 80);
// 宣纸远山：整张，宽 1600
await make('far.webp', 'ld_far.png', (img) => {
  const k = 1600 / img.width, c = createCanvas(1600, Math.round(img.height * k)); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return { c };
}, 74);
