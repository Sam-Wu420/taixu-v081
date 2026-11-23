import flagstoneArt from '../assets/mijing/flagstone.webp?inline';

// 水墨石板：一张可以四方连续平铺的石板地面（代码现画，不带图片）。秘境的石台、石桥用它铺面。
// 画法：一张被揉歪的方格网，每格一块石板（有的再劈成两块）；板心淡彩晕染，板缝深一些、偶有青苔，边上一道墨线，几条发丝裂纹。
// 网格的顶点、每块板的深浅都按「格子号对周期取模」算，所以左右、上下接得上。

const hash = (x: number, y: number, k: number) => { const s = Math.sin(x * 127.1 + y * 311.7 + k * 74.7) * 43758.5453; return s - Math.floor(s); };

let cache: HTMLCanvasElement | null = null;
/** 手绘的那张石板图（Grok 生成后处理成四方连续的，2026-11-13）：解码好了就用它，没好之前先用代码画的 */
let painted: HTMLCanvasElement | null = null, loading = false, version = 0;
/** 石板图换过几次（代码画的 → 手绘的）：缓存了铺好的地面的人据此重铺 */
export function flagstoneVersion(): number { return version; }
/** 一张可平铺的石板图；没有 document 的环境返回 null */
export function flagstone(size = 512): HTMLCanvasElement | null {
  if (painted) return painted;
  if (typeof document === 'undefined') return null;
  if (!loading) {
    loading = true;
    const im = new Image();
    im.onload = () => { const cv = document.createElement('canvas'); cv.width = im.naturalWidth; cv.height = im.naturalHeight; const g = cv.getContext('2d'); if (!g) return; g.drawImage(im, 0, 0); painted = cv; version++; };
    im.src = flagstoneArt;
  }
  if (cache && cache.width === size) return cache;
  const N = 6, S = size / N, cv = document.createElement('canvas'); cv.width = cv.height = size;
  const c = cv.getContext('2d'); if (!c) return null;
  const m = (i: number) => ((i % N) + N) % N;
  /** 网格顶点（揉歪过的） */
  const V = (i: number, j: number): [number, number] => [i * S + (hash(m(i), m(j), 1) - 0.5) * S * 0.34, j * S + (hash(m(i), m(j), 2) - 0.5) * S * 0.34];
  // 板缝的底色
  c.fillStyle = '#a3a596'; c.fillRect(0, 0, size, size);
  // 缝里的青苔
  for (let k = 0; k < 60; k++) { const x = hash(k, 3, 11) * size, y = hash(k, 7, 12) * size, r = 3 + hash(k, 1, 13) * 6; c.fillStyle = `rgba(${96 + hash(k, 2, 14) * 30 | 0},${118 + hash(k, 4, 15) * 26 | 0},${84},0.35)`; for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) { c.beginPath(); c.arc(x + ox, y + oy, r, 0, Math.PI * 2); c.fill(); } }
  const slab = (p: [number, number][], seed: number) => {
    // 往里收一点留出板缝，四角略圆
    const cx = p.reduce((a, q) => a + q[0], 0) / p.length, cy = p.reduce((a, q) => a + q[1], 0) / p.length;
    const q = p.map(([x, y]): [number, number] => [x + (cx - x) * 0.025 + Math.sign(cx - x) * 1.5, y + (cy - y) * 0.025 + Math.sign(cy - y) * 1.5]);
    // 直边的石板，四角只抹一点圆
    const path = () => { c.beginPath(); const n = q.length, s0 = q[0], s1 = q[1]; c.moveTo((s0[0] + s1[0]) / 2, (s0[1] + s1[1]) / 2); for (let i = 1; i <= n; i++) { const a = q[i % n], b = q[(i + 1) % n]; c.arcTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 5); } c.closePath(); };
    const v = hash(seed, 5, 21), warm = hash(seed, 9, 22);
    const r = 198 + v * 30 + warm * 8, g = 195 + v * 28, b = 180 + v * 26 - warm * 8;
    path(); c.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`; c.fill();
    // 板心的淡彩晕染：两三团深浅不一的水渍
    c.save(); path(); c.clip();
    for (let k = 0; k < 3; k++) {
      const x = cx + (hash(seed, k, 23) - 0.5) * S * 0.8, y = cy + (hash(seed, k, 24) - 0.5) * S * 0.8, rr = S * (0.3 + hash(seed, k, 25) * 0.4), dark = hash(seed, k, 26) < 0.55;
      const gr = c.createRadialGradient(x, y, 0, x, y, rr);
      gr.addColorStop(0, dark ? 'rgba(120,124,118,0.20)' : 'rgba(250,247,236,0.26)'); gr.addColorStop(1, dark ? 'rgba(120,124,118,0)' : 'rgba(250,247,236,0)');
      c.fillStyle = gr; c.fillRect(x - rr, y - rr, rr * 2, rr * 2);
    }
    // 发丝裂纹
    if (hash(seed, 3, 27) < 0.45) {
      c.strokeStyle = 'rgba(70,70,62,0.35)'; c.lineWidth = 0.9; c.beginPath();
      let x = cx + (hash(seed, 1, 28) - 0.5) * S * 0.5, y = cy + (hash(seed, 2, 28) - 0.5) * S * 0.5, a = hash(seed, 3, 28) * 6.28; c.moveTo(x, y);
      for (let k = 0; k < 5; k++) { a += (hash(seed, k, 29) - 0.5) * 1.2; x += Math.cos(a) * S * 0.14; y += Math.sin(a) * S * 0.14; c.lineTo(x, y); }
      c.stroke();
    }
    c.restore();
    // 墨线：一圈深浅不匀的勾边，朝下、朝右的两边重一些（像受光）
    path(); c.strokeStyle = 'rgba(58,58,50,0.42)'; c.lineWidth = 1.3; c.stroke();
    c.save(); path(); c.clip(); c.strokeStyle = 'rgba(40,40,34,0.22)'; c.lineWidth = 5; c.beginPath(); c.moveTo(q[1][0], q[1][1]); c.lineTo(q[2][0], q[2][1]); c.lineTo(q[3 % q.length][0], q[3 % q.length][1]); c.stroke(); c.restore();
  };
  for (let j = -1; j <= N; j++) for (let i = -1; i <= N; i++) {
    const a = V(i, j), b = V(i + 1, j), d = V(i + 1, j + 1), e = V(i, j + 1), seed = m(i) * 31 + m(j) * 17, cut = hash(m(i), m(j), 3);
    const mid = (p: [number, number], q: [number, number], t: number): [number, number] => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
    if (cut < 0.26) { const t = 0.38 + hash(m(i), m(j), 4) * 0.24, u = mid(a, b, t), w = mid(e, d, t); slab([a, u, w, e], seed); slab([u, b, d, w], seed + 500); }        // 竖着劈开
    else if (cut < 0.5) { const t = 0.38 + hash(m(i), m(j), 4) * 0.24, u = mid(a, e, t), w = mid(b, d, t); slab([a, b, w, u], seed); slab([u, w, d, e], seed + 500); }   // 横着劈开
    else slab([a, b, d, e], seed);
  }
  // 纸的颗粒
  const img = c.getImageData(0, 0, size, size), px = img.data;
  for (let i = 0; i < px.length; i += 4) { const n = (hash(i * 0.25 % size, Math.floor(i * 0.25 / size), 31) - 0.5) * 10; px[i] += n; px[i + 1] += n; px[i + 2] += n; }
  c.putImageData(img, 0, 0);
  return (cache = cv);
}
