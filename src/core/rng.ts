// 随机数与噪声工具
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 按给定的随机源洗牌（Fisher-Yates，就地，返回原数组）。生成世界、秘境这类「同一个种子必须处处一样」的地方用它，
 * 不要用 arr.sort(() => rnd() - 0.5)：比较函数前后矛盾时，排序调用它几次、结果怎样由 JS 引擎的排序实现决定，
 * Node 与浏览器（不同版本的 V8）结果不同，还会多吃或少吃几个随机数，把后面生成的东西全带偏。
 */
export function shuffleWith<T>(arr: T[], rnd: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
  return arr;
}

export class RNG {
  private f: () => number;
  constructor(seed = (Math.random() * 1e9) | 0) {
    this.f = mulberry32(seed);
  }
  next() { return this.f(); }
  range(a: number, b: number) { return a + (b - a) * this.f(); }
  int(a: number, b: number) { return Math.floor(a + (b - a + 1) * this.f()); }
  pick<T>(arr: readonly T[]): T { return arr[Math.floor(this.f() * arr.length)]; }
  chance(p: number) { return this.f() < p; }
  weighted<T>(items: readonly T[], w: (t: T) => number): T {
    let total = 0;
    for (const it of items) total += Math.max(0, w(it));
    let r = this.f() * total;
    for (const it of items) { r -= Math.max(0, w(it)); if (r <= 0) return it; }
    return items[items.length - 1];
  }
}

export const rng = new RNG();

export function hash2(x: number, y: number, seed = 0) {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263 + seed * 2246822519;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

function smooth(t: number) { return t * t * (3 - 2 * t); }

export function valueNoise(x: number, y: number, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  const u = smooth(xf), v = smooth(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x: number, y: number, oct = 4, seed = 0) {
  let s = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) {
    s += amp * valueNoise(x * f, y * f, seed + i * 17);
    norm += amp; amp *= 0.5; f *= 2.03;
  }
  return s / norm;
}

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);
export function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }

/** 可移植整数哈希（Math.imul，GLSL uint 可逐位复刻：地表着色器与 CPU 判定完全一致） */
export function hashU(x: number, y: number, seed = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, -2048144777)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
/** 可移植值噪声（与 gl/ground.ts 的 pnoise 一致） */
export function pnoise(x: number, y: number, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const a = hashU(xi, yi, seed), b = hashU(xi + 1, yi, seed);
  const c = hashU(xi, yi + 1, seed), d = hashU(xi + 1, yi + 1, seed);
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
