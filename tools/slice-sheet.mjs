// 把图片服务画出来的「一图多姿势」切成一格一张、清干净底、压成 webp。
// 用法：node tools/slice-sheet.mjs <输入.png> <输出目录> <名字> [--max=420] [--q=82] [--one] [--min=0.012] [--cut=48] [--white]
//   --white 强制按白底抠（四周是一层半透明白雾、四角却是黑的那种，自动判断不出来）
//   --max   每格最长边压到多少像素（包体：海兽一格 420 够用，首领的头 640，俯视的大东西单独给）
//   --one   整张当一格（不切，只清底、裁边、压缩）
//   --min   小于整图这个比例的碎块不算一格（并进最近的大块，离得远的丢掉）
//   --cut   透明度低于这个值的像素当成底（去掉画面四周那层淡淡的雾）
// 画出来的底不一定干净：有的是真透明，有的是半透明的白底、四周一层雾。这里先判断四角——
// 四角是不透明的浅色，就按「白底」反推透明度；否则只把很淡的像素清掉。
// 输出 <名字>_0.webp、<名字>_1.webp……（按从上到下、从左到右的顺序），并打印每格的尺寸和字节数。
import { loadImage, createCanvas } from '@napi-rs/canvas';
import fs from 'node:fs'; import path from 'node:path';

const args = process.argv.slice(2), [src, outDir, name] = args.filter((a) => !a.startsWith('--'));
if (!src || !outDir || !name) { console.error('用法：node tools/slice-sheet.mjs <输入.png> <输出目录> <名字> [--max=420] [--q=82] [--one]'); process.exit(1); }
const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? Number(a.slice(k.length + 3)) : d; };
const MAX = opt('max', 420), Q = opt('q', 82), ONE = args.includes('--one'), MIN = opt('min', 0.012), CUT = opt('cut', 48);

const im = await loadImage(src), W = im.width, H = im.height;
const cv = createCanvas(W, H), g = cv.getContext('2d'); g.drawImage(im, 0, 0);
const img = g.getImageData(0, 0, W, H), d = img.data;

// —— 清底
const corners = [0, (W - 1) * 4, (H - 1) * W * 4, (H * W - 1) * 4].map((i) => [d[i], d[i + 1], d[i + 2], d[i + 3]]);
const whiteBg = args.includes('--white') || corners.filter((c) => c[3] > 90 && Math.min(c[0], c[1], c[2]) > 225).length >= 3;
for (let i = 0; i < d.length; i += 4) {
  let a = d[i + 3];
  if (whiteBg) {
    // 画在白底上：越接近白越透明；颜色按「叠在白上」反推回去
    const k = 1 - Math.min(d[i], d[i + 1], d[i + 2]) / 255, a2 = Math.min(1, k * 1.9);
    if (a2 <= 0.06) { d[i + 3] = 0; continue; }
    for (let c = 0; c < 3; c++) d[i + c] = Math.max(0, Math.min(255, Math.round((d[i + c] - 255 * (1 - a2)) / a2)));
    a = Math.min(a, Math.round(a2 * 255));   // 原图自己的透明度也算（半透明的白雾）
  }
  d[i + 3] = a < CUT ? 0 : a < CUT * 2 ? Math.round((a - CUT) * 2) : a;   // 最淡的那一截清掉，接着的一截渐变过去，不留硬边
}

// —— 找格子：在缩小四倍的蒙版上找连通块
const S = 4, mw = Math.ceil(W / S), mh = Math.ceil(H / S), mask = new Uint8Array(mw * mh);
for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) if (d[(y * W + x) * 4 + 3] > 60) mask[((y / S) | 0) * mw + ((x / S) | 0)] = 1;
const label = new Int32Array(mw * mh).fill(-1), comps = [];
for (let i = 0; i < mask.length; i++) {
  if (!mask[i] || label[i] >= 0) continue;
  const id = comps.length, c = { x0: 1e9, y0: 1e9, x1: -1, y1: -1, n: 0 }, st = [i]; label[i] = id;
  while (st.length) {
    const q = st.pop(), x = q % mw, y = (q / mw) | 0; c.n++;
    if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x; if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
    // 八邻域，再多看两格：须子、尾巴尖这类细东西和身子之间常断一两个像素
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= mw || ny >= mh) continue; const k = ny * mw + nx; if (mask[k] && label[k] < 0) { label[k] = id; st.push(k); } }
  }
  comps.push(c);
}
let cells;
if (ONE) cells = [{ x0: Math.min(...comps.map((c) => c.x0)), y0: Math.min(...comps.map((c) => c.y0)), x1: Math.max(...comps.map((c) => c.x1)), y1: Math.max(...comps.map((c) => c.y1)) }];
else {
  const big = comps.filter((c) => c.n > mw * mh * MIN), small = comps.filter((c) => c.n <= mw * mh * MIN && c.n > 6);
  for (const s of small) {
    // 碎块（飞出去的鳞片、灯笼的火星）并进离它最近的那一格
    let best = null, bd = 1e9;
    for (const b of big) { const dx = Math.max(0, b.x0 - s.x1, s.x0 - b.x1), dy = Math.max(0, b.y0 - s.y1, s.y0 - b.y1), dd = Math.hypot(dx, dy); if (dd < bd) { bd = dd; best = b; } }
    if (best && bd < 18) { best.x0 = Math.min(best.x0, s.x0); best.y0 = Math.min(best.y0, s.y0); best.x1 = Math.max(best.x1, s.x1); best.y1 = Math.max(best.y1, s.y1); }
  }
  // 按行排：中心纵坐标相近的算一行
  const rowH = Math.max(...big.map((c) => c.y1 - c.y0)) * 0.6;
  cells = big.sort((a, b) => (a.y0 + a.y1) - (b.y0 + b.y1));
  const rows = []; for (const c of cells) { const cy = (c.y0 + c.y1) / 2, r = rows.find((q) => Math.abs(q.cy - cy) < rowH); if (r) r.list.push(c); else rows.push({ cy, list: [c] }); }
  cells = rows.flatMap((r) => r.list.sort((a, b) => a.x0 - b.x0));
}
g.putImageData(img, 0, 0);

// —— 每格裁出来、缩到上限、存 webp
fs.mkdirSync(outDir, { recursive: true });
let total = 0;
cells.forEach((c, i) => {
  const pad = 6, x = Math.max(0, c.x0 * S - pad), y = Math.max(0, c.y0 * S - pad), w = Math.min(W, (c.x1 + 1) * S + pad) - x, h = Math.min(H, (c.y1 + 1) * S + pad) - y;
  const k = Math.min(1, MAX / Math.max(w, h)), ow = Math.max(1, Math.round(w * k)), oh = Math.max(1, Math.round(h * k));
  const o = createCanvas(ow, oh), og = o.getContext('2d'); og.imageSmoothingQuality = 'high'; og.drawImage(cv, x, y, w, h, 0, 0, ow, oh);
  const buf = o.encodeSync('webp', Q), file = path.join(outDir, ONE ? `${name}.webp` : `${name}_${i}.webp`);
  fs.writeFileSync(file, buf); total += buf.length;
  console.log(path.basename(file).padEnd(24), `${ow}x${oh}`, (buf.length / 1024).toFixed(0) + ' KB', `（原图 ${x},${y} ${w}x${h}）`);
});
console.log(`${name}：${cells.length} 格，共 ${(total / 1024).toFixed(0)} KB${whiteBg ? '（按白底抠的）' : ''}`);
