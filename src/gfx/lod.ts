// 全局 LOD 算法核心（移植自 taixu071 v0.71）
//
// ── 统一量纲 ─────────────────────────────────────────────
//   E = zoom × dpr            —— 一个"世界单位"在屏幕上占多少设备像素
//   px(w) = w × E             —— 世界尺寸 w 的物体在屏上的设备像素尺寸
//   k(x) = smooth(a, b, x)    —— 该细节的显隐权重 0..1（a 起、b 满）
//
// ── 五档原语 ─────────────────────────────────────────────
//   1. 淡出      fade(ctx, k, fn)        —— 中间灰，不跳变
//   2. 密度抽样  keep(level, k, hash)    —— 分档对象按稳定哈希抽稀
//   3. 几何简化  geom(base, k, min)      —— 顶点/分段数连续收缩
//   4. 贴图降档  res(wantPx)             —— 只烘到"够用"的分辨率
//   5. 更新节流  cadence(k, maxStep)     —— 权重低的对象每 N 帧才更新一次
//
// ── 全局自适应 ───────────────────────────────────────────
//   noteFrame(ms) 用帧时间 EMA 调一个全局偏置 bias（0.75 ~ 1.15）：
//   掉帧时整体少画一点细节，回到 60fps 附近再慢慢补回来。

// ────────────────────────────── 全局偏置 ──────────────────────────────
let bias = 1;
let ema = 16.7;
let lowFpsMs = 0;

/** 每帧喂一次帧时间（ms），返回是否发生了调整（调试用） */
export function noteFrame(frameMs: number) {
  if (!(frameMs > 0) || frameMs > 500) return false;
  ema = ema * 0.9 + frameMs * 0.1;
  const before = bias;
  if (ema > 15.38) {
    lowFpsMs += frameMs;
    if (lowFpsMs >= 2000) {
      bias = Math.max(0.75, bias - 0.05);
      lowFpsMs = 0;
    }
  } else {
    lowFpsMs = 0;
  }
  if (ema > 20) bias = Math.max(0.75, bias - 0.004);
  else if (ema < 13.5) bias = Math.min(1.15, bias + 0.002);
  return bias !== before;
}
export const biasNow = () => bias;
export const emaMs = () => ema;

// ────────────────────────────── 标尺 ──────────────────────────────
export const smooth = (a: number, b: number, x: number) => {
  if (b <= a) return x >= b ? 1 : 0;
  const t = (x - a) / (b - a);
  return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
};

/** 一个世界单位占多少设备像素（含自适应偏置） */
export const pxPerUnit = (zoom: number, dpr: number) => zoom * dpr * bias;

/** 世界尺寸 w 的物体在屏幕上的设备像素尺寸 */
export const screenPx = (w: number, zoom: number, dpr: number) => w * zoom * dpr * bias;

/** 低于这个权重就当"已经不足一像素" */
export const GONE = 0.02;

/** 查表：波段在 x 处的权重 */
export const k = (band: readonly [number, number], x: number) => smooth(band[0], band[1], x);

// ────────────────────────────── 五档原语 ──────────────────────────────

/** 1. 淡出：k≈1 零开销；中间按 k^0.7 淡出；k≈0 直接不画 */
export function fade(ctx: CanvasRenderingContext2D, kk: number, fn: () => void) {
  if (kk <= GONE) return;
  if (kk >= 0.999) { fn(); return; }
  const a = ctx.globalAlpha;
  ctx.globalAlpha = a * Math.pow(kk, 0.7);
  fn();
  ctx.globalAlpha = a;
}

/** 2. 密度抽样：level 0..maxLevel 的对象按 kk 连续保留 */
export function keep(level: number, kk: number, hash: number, maxLevel = 2) {
  if (level <= 0) return true;
  if (kk >= 0.999) return true;
  if (kk <= GONE) return false;
  const p = kk * (maxLevel + 1) - level;
  if (p >= 1) return true;
  if (p <= 0) return false;
  return hash < p;
}

/** 3. 几何简化：顶点/分段数随 kk 连续收缩 */
export const geom = (base: number, kk: number, min = 4) =>
  Math.max(min, Math.round(base * (min / base + (1 - min / base) * kk)));

/** 4. 贴图降档：只烘到够用的分辨率 */
export const res = (wantPx: number, max = 2) =>
  wantPx <= 0.6 ? 0.5 : wantPx <= 1.2 ? 1 : wantPx <= 1.8 ? Math.min(1.5, max) : Math.min(2, max);

/** 5. 更新节流：kk 越低，更新间隔越长 */
export const cadence = (kk: number, maxStep = 4) =>
  kk >= 0.85 ? 1 : kk >= 0.55 ? Math.min(2, maxStep) : kk >= 0.25 ? Math.min(3, maxStep) : maxStep;
export const phase = (i: number, n: number) => n <= 1 ? true : (i % n) === 0;

// ────────────────────────────── 波段表 ──────────────────────────────
/** 场景类：单位 = 设备像素 / 世界单位 */
export const BAND = {
  water: [0.33, 0.38] as const,
  reflect: [0.33, 0.38] as const,
  cloud: [0.33, 0.38] as const,
  grass: [0.40, 0.46] as const,
  grassTier: [0.62, 0.92] as const,
  deco: [0.28, 0.34] as const,
  treeNear: [0.28, 0.34] as const,
  treeFar: [0.42, 0.50] as const,
  label: [0.32, 0.40] as const,
  bld: [0.45, 0.55] as const,
  effect: [0.55, 0.75] as const,
  groundFx: [0.30, 0.44] as const,
  scape: [0.34, 0.50] as const,
  sparkle: [0.40, 0.50] as const,
  shore: [0.36, 0.46] as const,
  river: [0.32, 0.42] as const,
  fall: [0.26, 0.36] as const,
  fallAnim: [0.40, 0.52] as const,
};

/** 角色类：单位 = 角色局部单位 → 屏幕像素 */
export const CHAR = {
  fine: [1.45, 1.75] as const,
  hand: [0.95, 1.25] as const,
  cloth: [0.90, 1.35] as const,
};

// ────────────────────────────── 树的两段表示 ──────────────────────────────
export const TREE_TIER = [1.5, 6] as const;

export function treeTiers(treePx: number) {
  const px = Number.isFinite(treePx) ? treePx : 0;
  const sprite = smooth(TREE_TIER[0], TREE_TIER[1], px);
  return { sprite, cover: 1 - sprite };
}

/** 林色底的不透明度 */
export const TREES_PER_CHUNK = 120;
export const treeDeficit = (cap: number) => 1 - Math.min(1, Math.max(0, cap) / TREES_PER_CHUNK);
export const canopyAlpha = (cap: number, max = 0.85) => max * treeDeficit(cap);

// ────────────────────────────── 导出汇总 ──────────────────────────────
export const LOD = {
  BAND, CHAR, GONE, TREE_TIER, TREES_PER_CHUNK,
  k, fade, keep, geom, res, cadence, phase, treeTiers,
  treeDeficit, canopyAlpha,
  smooth, pxPerUnit, screenPx, biasNow, emaMs, noteFrame,
};
