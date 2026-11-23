// 人界地表程序画材：可平铺、固定种子、运行时生成并缓存，不使用外部图片。
// 场景着色器在画材生成期间继续使用原有程序地表；每帧最多生成一层。
import { makeCanvas } from '../core/canvas';

export const GROUND_TEX_SIZE = 256;
// 原有层序：春夏草、秋草、冬草、林地、草原、沙漠、岩石、雪、道路、河滩、戈壁、赤土、阴地、海滩。
const COLORS: readonly (readonly [number, number, number])[] = [
  [160,184,130],[167,184,129],[196,173,95],[189,175,135],
  [169,164,142],[177,172,130],[235,218,180],[179,172,158],
  [235,237,236],[200,168,103],[152,142,128],[172,156,131],
  [94,35,26],[96,92,103],[231,220,202],
];
export const GROUND_AVG: number[][] = COLORS.map(c => c.map(x => x / 255));
export const GROUND_LAYERS = COLORS.length;
const tiles: (HTMLCanvasElement | undefined)[] = new Array(GROUND_LAYERS);
let imgs: HTMLCanvasElement[] | null = null;
let started = false;

function hash(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
// 整数正交晶格变换 (a*u + b*v, -b*u + a*v) 严格保持 [0,1)² 周期无缝，同时以多倾角彻底消除横竖方格感。
function rotNoise(u: number, v: number, a: number, b: number, cells: number, seed: number): number {
  const uu = (a * u + b * v) * cells, vv = (-b * u + a * v) * cells;
  const ix = Math.floor(uu), iy = Math.floor(vv), fx = uu - ix, fy = vv - iy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const mod = (k: number) => ((k % cells) + cells) % cells;
  const at = (p: number, q: number) => hash(mod(p), mod(q), seed);
  const c00 = at(ix, iy), c10 = at(ix + 1, iy), c01 = at(ix, iy + 1), c11 = at(ix + 1, iy + 1);
  return (c00 + (c10 - c00) * sx) * (1 - sy) + (c01 + (c11 - c01) * sx) * sy;
}
/** 笔触参数：草向下垂、岩石斜擦、沙与路近水平。长度与数量按贴图尺寸缩放，换分辨率观感一致。 */
function strokeSpec(layer: number, n: number) {
  const rock = layer === 7 || layer === 10 || layer === 13;
  const grass = layer <= 5;
  const sand = layer === 9 || layer === 11 || layer === 14;
  const k = n / 512;
  return {
    count: Math.round((rock ? 5200 : grass ? 7000 : sand ? 3800 : 5000) * k * k),
    ang: rock ? -0.35 : grass ? -Math.PI / 2 - 0.25 : sand ? 0.18 : -0.2,
    spread: rock ? 1.1 : grass ? 0.5 : sand ? 0.35 : 0.8,
    len: ((rock ? [6, 20] : grass ? [5, 16] : sand ? [8, 26] : [6, 22]).map((v) => v * k)) as [number, number],
  };
}
/**
 * 画一批方向性短笔触（只画 [from,to) 这段，便于分片）。
 * 四边环绕：跨边界的笔触在对侧再画一次，保证贴图可平铺。
 */
function drawStrokes(c: CanvasRenderingContext2D, seed: number, spec: ReturnType<typeof strokeSpec>, from: number, to: number, n: number, strength: number) {
  c.lineCap = 'round';
  const k = n / 512;
  for (let i = from; i < to; i++) {
    const x = hash(i, 11, seed) * n, y = hash(i, 12, seed) * n;
    const a = spec.ang + (hash(i, 13, seed) - 0.5) * spec.spread;
    const L = spec.len[0] + hash(i, 14, seed) * (spec.len[1] - spec.len[0]);
    const dark = hash(i, 15, seed) < 0.55;
    const al = ((dark ? 0.06 : 0.05) + hash(i, 16, seed) * 0.05) * strength;
    c.strokeStyle = dark ? `rgba(30,32,28,${al})` : `rgba(255,255,250,${al * 0.9})`;
    c.lineWidth = Math.max(0.6, (0.7 + hash(i, 17, seed) * 1.1) * k * 1.6);
    const dx = Math.cos(a) * L, dy = Math.sin(a) * L;
    for (const ox of [-n, 0, n]) for (const oy of [-n, 0, n]) {
      const sx = x + ox, sy = y + oy;
      if (sx + dx < -2 || sx > n + 2 || sy + dy < -2 || sy > n + 2) continue;
      c.beginPath();
      c.moveTo(sx, sy);
      c.quadraticCurveTo(sx + dx * 0.5 - dy * 0.12, sy + dy * 0.5 + dx * 0.12, sx + dx, sy + dy);
      c.stroke();
    }
  }
}
/** 可分片生成，避免一次绘制整层造成帧停顿。 */
function makeTileJob(layer: number) {
  const n = GROUND_TEX_SIZE, canvas = makeCanvas(n, n), c = canvas.getContext('2d');
  if (!c) return null;
  const image = c.createImageData(n, n), data = image.data, base = COLORS[layer];
  let y = 0;
  const seed = 31 + layer * 43, rock = layer === 7 || layer === 10 || layer === 13, grass = layer <= 5;
  const strength = layer === 8 ? 0.55 : layer === 12 ? 0.8 : 1;
  const spec = strokeSpec(layer, n);
  const batch = Math.max(64, Math.round(spec.count / 12));
  let drawn = 0, pixelsDone = false;
  return {
    step(rows: number): boolean {
      if (!pixelsDone) {
        const end = Math.min(n, y + rows);
        for (; y < end; y++) for (let x = 0; x < n; x++) {
          const u = x / n, v = y / n;
          const broad = (rotNoise(u, v, 2, 1, 3, seed) + rotNoise(u, v, 1, 3, 2, seed + 17)) * 0.5 - 0.5;
          const medium = rotNoise(u, v, 3, 2, 5, seed + 1) - 0.5;
          const grain = rotNoise(u, v, 2, 5, 11, seed + 2) - 0.5;
          const stroke = (grass
            ? rotNoise(u, v, 3, 1, 9, seed + 3) * 0.65 + rotNoise(u, v, 4, 3, 6, seed + 19) * 0.35
            : rock
              ? rotNoise(u, v, 1, 4, 7, seed + 3) * 0.6 + rotNoise(u, v, 3, 2, 8, seed + 19) * 0.4
              : rotNoise(u, v, 1, 3, 8, seed + 3)) - 0.5;
          // 像素级细颗粒：上面几层噪声最细也有 20px 以上，放大后只剩晕染；这两下补到每像素，
          // 让地面在近处有颗粒感（远景会被 mipmap 抹平，不会噪）。
          const fine = hash(x, y, seed + 101) - 0.5;
          const fine2 = hash(x >> 1, y >> 1, seed + 77) - 0.5;
          const shade = 1 + strength * (broad * 0.22 + medium * 0.14 + grain * 0.055 + stroke * 0.16 + fine * 0.05 + fine2 * 0.035);
          const k = (y * n + x) * 4;
          for (let ch = 0; ch < 3; ch++) {
            const value = Math.max(0, Math.min(255, Math.round(base[ch] * shade)));
            data[k + ch] = value;
          }
          data[k + 3] = 255;
        }
        if (y < n) return false;
        c!.putImageData(image, 0, 0);
        pixelsDone = true;
      }
      // 笔触阶段：每步画一批，仍受 runGroundSlice 的时间预算约束，不会一口气卡住
      if (drawn < spec.count) {
        const to = Math.min(spec.count, drawn + batch);
        drawStrokes(c!, seed, spec, drawn, to, n, strength);
        drawn = to;
        if (drawn < spec.count) return false;
      }
      // 均值必须在笔触画完之后再量：着色器用它把程序地表和画材对齐，笔触会轻微改变均值
      const px = c!.getImageData(0, 0, n, n).data;
      const avg = [0, 0, 0];
      for (let i = 0; i < px.length; i += 4) { avg[0] += px[i]; avg[1] += px[i + 1]; avg[2] += px[i + 2]; }
      GROUND_AVG[layer] = avg.map((s) => s / (n * n * 255));
      tiles[layer] = canvas;
      return true;
    },
  };
}
/** 已生成的画材；无 DOM 或画布不可用时返回 null。 */
export function groundTile(layer: number): HTMLCanvasElement | null {
  if (!Number.isInteger(layer) || layer < 0 || layer >= GROUND_LAYERS) return null;
  return tiles[layer] ?? null;
}

/** 每次至少推进一行、最多八行；时间预算不能中断正在执行的单行或画布提交。 */
export function runGroundSlice(job: { step(rows: number): boolean }, now = () => performance.now(), budgetMs = 2): boolean {
  const start = now();
  for (let row = 0; row < 8; row++) {
    if (job.step(1)) return true;
    if (now() - start >= budgetMs) break;
  }
  return false;
}

export function loadGroundTex() {
  if (started || imgs || typeof document === 'undefined') return;
  started = true;
  let i = 0, job: ReturnType<typeof makeTileJob> = null;
  const schedule = (f: () => void) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(f);
    else setTimeout(f, 0);
  };
  const next = () => {
    try {
      // 失败重试时复用已完成画布，避免替换正在被秘境图样引用的材质。
      while (i < GROUND_LAYERS && tiles[i]) i++;
      if (i === GROUND_LAYERS) { imgs = tiles.slice() as HTMLCanvasElement[]; return; }
      if (!job) job = makeTileJob(i);
      if (!job) { started = false; return; }
      // 按时间与行数双重限额分片；画材未完成时仍使用程序着色器地表。
      if (runGroundSlice(job)) { job = null; i++; }
      if (i === GROUND_LAYERS) { imgs = tiles.slice() as HTMLCanvasElement[]; return; }
      schedule(next);
    } catch (e) { started = false; console.warn('程序地表画材生成失败，继续使用程序地表', e); }
  };
  schedule(next);
}
export function groundImages() { return imgs; }
