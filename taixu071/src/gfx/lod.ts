// v0.71 · 全局 LOD 算法核心
//
// ── 问题 ────────────────────────────────────────────────
// 以前每个绘制/更新系统各自写自己的判据：地表 z<0.35、草 z<0.42、树 0.30/0.45、
// 角色 E>1.6、山与瀑布各自 resBucket、匾额 Z>0.45……单位不统一（有 zoom、有 dpr、
// 有局部像素），而且都是硬切：缩放跨过某个数，整块细节「啪」地出现或消失。
//
// ── 统一量纲 ─────────────────────────────────────────────
//   E = zoom × dpr            —— 一个「世界单位」在屏幕上占多少设备像素
//   px(w) = w × E             —— 世界尺寸 w 的物体在屏上的设备像素尺寸
//   k(x) = smooth(a, b, x)    —— 该细节的显隐权重 0..1（a 起、b 满）
// 判定依据不是缩放本身，而是「这件东西在屏幕上有多大」：60px 高的树就是 60px 高的树，
// 与玩家用的是几倍缩放无关。角色的局部单位另有一套（CHAR 波段，单位是局部 px）。
//
// ── 五档算法 ─────────────────────────────────────────────
//   1. 淡出      fade(ctx, k, fn)        —— 中间灰，不跳变；k≈0 才真正不画（省性能）
//   2. 密度抽样  keep(level, k, hash)    —— 分档对象按稳定哈希抽稀，整片变疏而不是成片消失
//   3. 几何简化  geom(base, k, min)      —— 顶点/分段数连续收缩，保留最小可看形状
//   4. 贴图降档  res(wantPx)             —— 只烘到「够用」的分辨率，不超采样
//   5. 更新节流  cadence(k, maxStep)     —— 权重低的对象每 N 帧才更新一次（AI/物理/动画）
//
// ── 全局自适应 ───────────────────────────────────────────
//   noteFrame(ms) 用帧时间 EMA 调一个全局偏置 bias（0.75 ~ 1.15）：
//   掉帧时整体少画一点细节，回到 60fps 附近再慢慢补回来。所有系统只要把 E 乘上 bias()
//   就自动跟着这台机器的性能走，不必各自写「低配模式」。
//
// 接入方式见 docs/v0.71-lod.md 的迁移表；新系统照抄五个原语就够了。

// ────────────────────────────── 全局偏置 ──────────────────────────────
let bias = 1;
let ema = 16.7;
let lowFpsMs = 0;
/** 每帧喂一次帧时间（ms），返回是否发生了调整（调试用） */
export function noteFrame(frameMs: number) {
  if (!(frameMs > 0) || frameMs > 500) return false;      // 切后台回来的巨帧不算
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
  if (ema > 20) bias = Math.max(0.75, bias - 0.004);       // 掉到 50fps 以下：慢慢减
  else if (ema < 13.5) bias = Math.min(1.15, bias + 0.002); // 稳在 74fps 以上：慢慢加
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
/** 一个世界单位占多少设备像素（含自适应偏置：掉帧时整体少画细节） */
export const pxPerUnit = (zoom: number, dpr: number) => zoom * dpr * bias;
/** 世界尺寸 w 的物体在屏幕上的设备像素尺寸 */
export const screenPx = (w: number, zoom: number, dpr: number) => w * zoom * dpr * bias;

/** 低于这个权重就当「已经不足一像素」：此时才真正跳过（其余时候只要还看得见就画） */
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

/** 2. 密度抽样：level 0..maxLevel 的对象按 kk 连续保留；hash 由坐标给出（同一点恒定，不闪）
 *   p(level) = clamp(kk*(maxLevel+1) − level, 0, 1)：档位越高越早被抽掉，
 *   于是「远看只剩第 0 档、再远连第 0 档也变稀」，不会在某一个缩放值上整片消失。 */
export function keep(level: number, kk: number, hash: number, maxLevel = 2) {
  if (level <= 0) return true;                       // 第 0 档是「基础轮廓」，永远留
  if (kk >= 0.999) return true;
  if (kk <= GONE) return false;
  const p = kk * (maxLevel + 1) - level;
  if (p >= 1) return true;
  if (p <= 0) return false;
  return hash < p;
}

/** 3. 几何简化：顶点/分段数随 kk 连续收缩，但不少于 min（少于 min 形状会碎） */
export const geom = (base: number, kk: number, min = 4) =>
  Math.max(min, Math.round(base * (min / base + (1 - min / base) * kk)));

/** 4. 贴图降档：只烘到够用的分辨率（0.5 / 1 / 1.5 / 2） */
export const res = (wantPx: number, max = 2) =>
  wantPx <= 0.6 ? 0.5 : wantPx <= 1.2 ? 1 : wantPx <= 1.8 ? Math.min(1.5, max) : Math.min(2, max);

/** 5. 更新节流：kk 越低，更新间隔越长（1..maxStep 帧）；配合 phase 错开，避免同帧齐动 */
export const cadence = (kk: number, maxStep = 4) =>
  kk >= 0.85 ? 1 : kk >= 0.55 ? Math.min(2, maxStep) : kk >= 0.25 ? Math.min(3, maxStep) : maxStep;
export const phase = (i: number, n: number) => n <= 1 ? true : (i % n) === 0;

// ────────────────────────────── 树的两段表示 ──────────────────────────────
// 树的屏上高度(treePx)决定用哪种表示：大到能看出枝叶就画精灵，小到只剩一两个像素就换同色小块。
// 两个权重严格互补（相加恒为 1）：换挡处同时各出一半，观感上只看到「变淡/变实」，看不到切换。
export const TREE_TIER = [1.5, 6] as const;
/** 极远林层权重与常规林层权重交接：在摘要退出前连续对齐，避免切换时整片树冠明暗跳变。 */
export function farCanopyAlpha(zoom: number, nearAlpha: number, farAlpha: number): number {
  // 与远景迟滞的进入点 0.045 完全对齐；此后远景态沿用实时常规权重直到退出点 0.055。
  return farAlpha + (nearAlpha - farAlpha) * smooth(0.02, 0.045, zoom);
}
/** 小山远景保留 8px 可辨认轮廓，在 5→12px 间连续长到真实屏幕尺寸。 */
export function mountainSizePx(screenHeight: number): number {
  const h = Number.isFinite(screenHeight) ? Math.max(0, screenHeight) : 0;
  return h < 5 ? 8 : h < 12 ? 8 + 4 * smooth(5, 12, h) : h;
}
/** 仅调山体内部点缀密度；外轮廓、基色与存在权重不受缩放影响。 */
export function mountainTextureDetail(screenHeight: number): number {
  const h = Number.isFinite(screenHeight) ? Math.max(0, screenHeight) : 0;
  return 0.15 + 0.85 * Math.round(smooth(20, 220, h) * 8) / 8;
}
/** 一块地平均本来有多少棵树（渲染上限按它折算「缺口」） */
export const TREES_PER_CHUNK = 120;
/** 缺口 = 1 - 实画比例：画不了的树用林色块补上，两者加起来才是完整的一片林子 */
export const treeDeficit = (cap: number) => 1 - Math.min(1, Math.max(0, cap) / TREES_PER_CHUNK);
/** 林色底的不透明度：远景接近满值，近景随实画比例连续退到 0（不设档位） */
export const canopyAlpha = (cap: number, max = 0.85) => max * treeDeficit(cap);
/** 云雾/迷雾缩放淡出系数：zoom <= 0.16 全退至 0，0.16..0.42 渐显，近景适度让位以免遮挡 */
export const cloudZoomFade = (zoom: number): number =>
  Math.min(1, Math.max(0, (zoom - 0.16) / 0.26)) * Math.min(1, Math.max(0.35, 1.25 - zoom * 0.32));
export function treeTiers(treePx: number) {
  const px = Number.isFinite(treePx) ? treePx : 0;
  const sprite = smooth(TREE_TIER[0], TREE_TIER[1], px);
  return { sprite, cover: 1 - sprite };
}

// ────────────────────────────── 波段表 ──────────────────────────────
/** 场景类：单位 = 设备像素 / 世界单位（与 pxPerUnit 同量纲） */
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
  // v0.72：原先各写一套的硬阈值，统一到这里（单位同上：设备像素 / 世界单位）
  groundFx: [0.30, 0.44] as const,   // 熔岩湖余烬、血潭涟漪、祭坛血光、遗骸光环、地面贴花
  scape: [0.34, 0.50] as const,      // 倒影、锦鲤、流萤、夜景
  sparkle: [0.40, 0.50] as const,    // 水面粼光
  shore: [0.36, 0.46] as const,      // 岸边浪花
  river: [0.32, 0.42] as const,      // 河流水光
  fall: [0.26, 0.36] as const,       // 瀑布水练（画不画）
  fallAnim: [0.40, 0.52] as const,   // 瀑布动画（动起来才动的部分）
};

/** 角色类：单位 = 角色局部单位 → 屏幕像素（170 单位的角色 ≈ 170E 高） */
export const CHAR = {
  fine: [1.45, 1.75] as const,
  hand: [0.95, 1.25] as const,
  cloth: [0.90, 1.35] as const,
};

export const LOD = {
  BAND, CHAR, GONE, TREE_TIER, farCanopyAlpha, mountainSizePx, mountainTextureDetail, TREES_PER_CHUNK, treeDeficit, canopyAlpha,
  k, fade, keep, geom, res, cadence, phase, treeTiers,
  smooth, pxPerUnit, screenPx, biasNow, emaMs, noteFrame,
};
