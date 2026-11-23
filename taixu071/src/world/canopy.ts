// v0.73 · 远景「林子」层（地图色块）
//
// 问题：视野拉到极远时，一棵树只有一两个像素，逐棵画精灵是纯浪费（一屏几千次 fill），
// 而且仍然看不出「这里是一片林子」。正确的降级不是把树变小，而是换成**整片林子的色块**——
// 这也是玩家在远处真正想看到的东西（哪里有林、什么林）。
//
// 做法：按当前缩放选一个世界-纹素尺度（2 屏像素 ≈ 1 纹素，按 √2 取档，缩放时靠双线性重采样过渡），
// 把视野附近的一块地**烘成一张位图**：逐纹素采样地形的 forest 场（叠加花林的树种色），
// 得到的是连续、无接缝的林地色块。烘好之后每帧只有一次 drawImage。
//
// 为什么不逐棵画：远景下逐棵的位置信息早已低于一个像素，而生成装饰块（getDecos）本身就很贵，
// 极远视野更是要遍历成千上万个区块——这正是 farSummary 存在的理由。
//
// 颜色：`coverColor(sp, season)` 与真树同一套配色，所以放大到能看见树时光色相不跳。
import { coverColor, type Season, type Species } from '../gfx/tree';
import { smooth } from '../gfx/lod';
import type { Terrain } from './terrain';

type View = { left: number; top: number; right: number; bottom: number };

const PAD = 0.28;               // 视野四周多烘一圈，镜头小幅移动不用重烘
const MAX_TEXELS = 220_000;     // 单张上限（约 560×400），超过就放大纹素尺度
const REFRESH_MS = 4;           // 已有上一张完整图时每帧最多花 4ms 后台渐进补烘，避免卡顿尖峰
const FIRST_BAKE_MS = 8;        // 首次尚未生成任何完整图时允许单帧预算稍大，同时控制单帧不掉帧

const rgbCache = new Map<string, readonly [number, number, number]>();
function coverRgb(sp: Species, season: Season): readonly [number, number, number] {
  const k = `${sp}:${season}`;
  let rgb = rgbCache.get(k);
  if (!rgb) {
    const col = coverColor(sp, season);
    rgb = [parseInt(col.slice(1, 3), 16), parseInt(col.slice(3, 5), 16), parseInt(col.slice(5, 7), 16)];
    rgbCache.set(k, rgb);
  }
  return rgb;
}

/** 气候 → 树种（与 terrain 生成树林时的选择保持一致的大方向） */
function climateSpecies(cold: number, arid: number): Species | null {
  if (arid > 0.62) return null;                        // 荒漠：只有零星旱树，不值得成片
  if (cold > 0.55) return 'snowpine';
  if (cold > 0.38) return 'pine';
  if (arid > 0.42) return 'cypress';
  return 'broad';
}

/** 视野内的花林（含程序生成的花林），按区域网格一次性收集并去重 */
function collectGroves(T: Terrain, rect: { x: number; y: number; w: number; h: number }) {
  const out: { x: number; y: number; rx: number; ry: number; sp: Species }[] = [];
  const x0 = rect.x, y0 = rect.y, x1 = rect.x + rect.w, y1 = rect.y + rect.h;
  if (typeof (T as Partial<Terrain>).grovesInRect === 'function') {
    for (const gv of T.grovesInRect(x0, y0, x1, y1)) {
      out.push({ x: gv.x, y: gv.y, rx: gv.r, ry: gv.r * 0.75, sp: gv.sp });
    }
    return out;
  }
  const seen = new Set<unknown>();
  const step = 1000;
  for (let y = y0; y <= y1; y += step) for (let x = x0; x <= x1; x += step) {
    for (const gv of T.grovesNear(x, y, step)) {
      if (seen.has(gv)) continue;
      seen.add(gv);
      if (gv.x + gv.r < x0 || gv.x - gv.r > x1) continue;
      if (gv.y + gv.r < y0 || gv.y - gv.r > y1) continue;
      out.push({ x: gv.x, y: gv.y, rx: gv.r, ry: gv.r * 0.75, sp: gv.sp });
    }
  }
  return out;
}

export class CanopyLayer {
  private cv: HTMLCanvasElement | null = null;
  /** 最近一次完整烘焙的可见图；新烘焙期间继续显示它，避免缩放时整片林色闪没。 */
  private shown: { cv: HTMLCanvasElement; rect: { x: number; y: number; w: number; h: number }; wt: number; terrain: Terrain; season: Season } | null = null;
  private g: CanvasRenderingContext2D | null = null;
  private img: ImageData | null = null;
  private season: Season = 0;
  private terrain: Terrain | null = null;
  /** 纹素尺度（世界单位 / 纹素），按 √2 取档，避免每帧都重烘 */
  private wt = 0;
  /** 本张位图覆盖的世界矩形 */
  private rect = { x: 0, y: 0, w: 0, h: 0 };
  /** 已烘到第几行（交错推进，填得快一些；烘焙期间其余部分视为透明） */
  private pRow = 0;   // 当前交错趟数（0..stride-1）
  private pY = 0;     // 本趟内的行游标
  private stride = 8;
  private rowsDone = 0;
  private done = false;
  /** 本次烘焙范围内的花林（桃/枫/杏…）：显式色块比 forest 场更可信 */
  private groves: { x: number; y: number; rx: number; ry: number; sp: Species }[] = [];
  private lastZoom = 0;
  version = 0;
  /** 统计，供 F3 面板与测试使用 */
  texels = 0;
  bakes = 0;
  get ready() { return !!this.img && this.done; }
  get hasShown() { return !!this.shown; }
  get w() { return this.cv?.width ?? 0; }
  get h() { return this.cv?.height ?? 0; }
  get progress() { return this.h ? Math.min(1, this.rowsDone / this.h) : 0; }

  /** 需要的纹素尺度：远景一格约 2 个屏幕像素 */
  static scaleFor(zoom: number) {
    const want = 2 / Math.max(1e-6, zoom);
    // √2 取档：缩放缓慢变化时沿用旧位图（重采样），跨档才重烘
    return Math.pow(2, Math.round(Math.log2(Math.max(24, want))));
  }

  /**
   * 仅在缓存覆盖不了当前视野，或屏幕采样密度超过视野/像素预算时重烘。
   * 缩放阈值由 CSS 视野面积与 MAX_TEXELS 推导，不按每个 zoom 浮点变化重建。
   */
  ensure(T: Terrain, season: Season, view: View, zoom: number) {
    const ratio = this.lastZoom > 0 ? Math.max(zoom / this.lastZoom, this.lastZoom / zoom) : 1;
    const zoomMoving = ratio > 1.004 && ratio < 1.35;
    this.lastZoom = zoom;
    const spanW = Math.max(1, view.right - view.left), spanH = Math.max(1, view.bottom - view.top);
    const padW = spanW * (1 + PAD * 2), padH = spanH * (1 + PAD * 2);
    const cx = (view.left + view.right) / 2, cy = (view.top + view.bottom) / 2;
    // 覆盖判定只要求当前可见视口仍完整落在缓存内；PAD 余量用于允许继续缩放 / 移动，
    // 避免视野稍微变大就每帧因 padding 边缘变化而重启烘焙。
    const need = { x: view.left, y: view.top, w: spanW, h: spanH };
    // 输出画布可用像素预算映射到屏幕后，每个纹素允许占用的 CSS 像素数；窗口/视野/预算改变时自动变化。
    const pixelLimit = Math.max(
      CanopyLayer.scaleFor(zoom) * zoom,
      Math.sqrt((padW * zoom) * (padH * zoom) / MAX_TEXELS),
    );
    // 给当前缓存一个纹素的线性重采样余量；连续缩放期间放宽到 1.8× 等停稳后再补清晰，避免每两帧反复重启烘焙。
    const qualityLimit = pixelLimit + 1;
    const activeLimit = zoomMoving ? qualityLimit * 1.8 : qualityLimit;
    const covers = (rect: { x: number; y: number; w: number; h: number }) =>
      rect.x <= need.x && rect.y <= need.y && rect.x + rect.w >= need.x + need.w && rect.y + rect.h >= need.y + need.h;
    const adequate = (wt: number, rect: { x: number; y: number; w: number; h: number }) =>
      covers(rect) && wt * zoom <= activeLimit;
    const sameScene = this.terrain === T && this.season === season;
    // 已完成图能覆盖当前 padded view 且纹素屏幕尺寸仍在预算内：纯重采样，不重烘。
    if (sameScene && this.shown?.terrain === T && this.shown.season === season && adequate(this.shown.wt, this.shown.rect)) return false;
    // 已在后台生成的目标图也满足当前线性质量 / 覆盖约束，继续完成而非每帧废弃重来。
    if (sameScene && this.cv && !this.done && adequate(this.wt, this.rect)) return false;

    const wt = Math.max(CanopyLayer.scaleFor(zoom), Math.sqrt((padW * padH) / MAX_TEXELS));
    const fw = Math.max(8, Math.min(1024, Math.round(padW / wt)));
    const fh = Math.max(8, Math.min(1024, Math.round(padH / wt)));
    const rw = fw * wt, rh = fh * wt;
    const rect = { x: cx - rw / 2, y: cy - rh / 2, w: rw, h: rh };
    this.build(T, season, rect, wt, fw, fh);
    return true;
  }

  private build(T: Terrain, season: Season, rect: { x: number; y: number; w: number; h: number }, wt: number, w: number, h: number) {
    this.terrain = T; this.season = season; this.wt = wt;
    this.rect = { x: rect.x, y: rect.y, w: w * wt, h: h * wt };
    // 不重设当前可见 canvas 的尺寸：改尺寸会立刻清空整张图，缩放时表现为林色层闪烁消失。
    // 每次烘焙使用独立画布，完成后再原子切换 shown。
    this.cv = document.createElement('canvas');
    this.cv.width = w; this.cv.height = h;
    this.g = this.cv.getContext('2d', { willReadFrequently: true });
    this.img = this.g ? this.g.createImageData(w, h) : null;
    this.pRow = 0; this.pY = 0; this.rowsDone = 0; this.done = false; this.texels = w * h; this.bakes++;
    this.groves = collectGroves(T, this.rect);
    // 逐行烘：半成品会被直接丢弃（见 draw），所以不需要交错，也不会出现条纹
    this.stride = 1;
  }

  /** 每帧补烘一小段；返回是否还有没烘完的
   *  交错推进：先烘 0、stride、2*stride… 行，再回到第 1 行，如此循环。
   *  没烘完时画面是均匀「逐渐变清」，而不是从上往下刷一条扫描线。 */
  step(ms?: number): boolean {
    if (!this.img || !this.terrain || !this.g || this.done) return false;
    const budgetMs = ms ?? (this.shown ? REFRESH_MS : FIRST_BAKE_MS);
    const img = this.img, w = this.cv!.width, h = this.cv!.height, T = this.terrain, season = this.season;
    const d = img.data, wt = this.wt, rx = this.rect.x, ry = this.rect.y;
    const t0 = performance.now();
    let start = this.pRow, y = this.pY;
    for (; start < this.stride; start++, y = start) {
      for (; y < h; y += this.stride) {
        for (let x = 0; x < w; x++) {
          const wx = rx + (x + 0.5) * wt, wy = ry + (y + 0.5) * wt;
          const s2 = T.sample(wx, wy);
          const i = (y * w + x) * 4;
          if (!(s2.land > 0.55)) continue;                       // 水面/海：留给地形自己
          const dens = smooth(0.44, 0.74, s2.forest) * (1 - smooth(0.58, 0.8, s2.arid));
          if (dens <= 0.02) continue;
          const sp = climateSpecies(s2.cold, s2.arid);
          if (!sp) continue;
          // 高海拔裸岩：林子退到半山腰以下
          const alt = 1 - smooth(0.5, 0.68, s2.elev);
          this.px(d, i, coverRgb(sp, season), Math.min(0.86, 0.42 + dens * 0.5) * alt);
        }
        this.rowsDone++;
        if (performance.now() - t0 > budgetMs) { this.pRow = start; this.pY = y + this.stride; return true; }
      }
    }
    this.pRow = 0; this.pY = 0; this.done = true; this.paintGroves(); this.flush();
    if (this.cv && this.terrain) this.shown = { cv: this.cv, rect: { ...this.rect }, wt: this.wt, terrain: this.terrain, season: this.season };
    return false;
  }

  /** 花林：按椭圆范围整块着色（比逐纹素判断便宜，也保证成片） */
  private paintGroves() {
    if (!this.img || !this.groves.length) return;
    const d = this.img.data, w = this.cv!.width, h = this.cv!.height;
    const wt = this.wt, rx = this.rect.x, ry = this.rect.y;
    for (const gv of this.groves) {
      const rgb = coverRgb(gv.sp, this.season);
      const x0 = Math.max(0, Math.floor((gv.x - gv.rx - rx) / wt)), x1 = Math.min(w - 1, Math.ceil((gv.x + gv.rx - rx) / wt));
      const y0 = Math.max(0, Math.floor((gv.y - gv.ry - ry) / wt)), y1 = Math.min(h - 1, Math.ceil((gv.y + gv.ry - ry) / wt));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const q = ((x + 0.5) * wt + rx - gv.x) / gv.rx, r2 = ((y + 0.5) * wt + ry - gv.y) / gv.ry;
        const dd = q * q + r2 * r2;
        if (dd > 1) continue;
        const i = (y * w + x) * 4;
        this.px(d, i, rgb, 0.8 * (1 - dd * 0.35));
      }
    }
  }

  private px(d: Uint8ClampedArray, i: number, rgb: readonly [number, number, number], a: number) {
    d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; d[i + 3] = Math.round(255 * Math.min(1, a));
  }

  private flush() { if (this.g && this.img) { this.g.putImageData(this.img, 0, 0); this.version++; } }

  get shownState() {
    const s = this.shown;
    if (!s || s.terrain !== this.terrain || s.season !== this.season) return null;
    return s;
  }

  /** 只在世界坐标下贴一次；alpha 由 LOD 权重给（0 时零开销） */
  draw(ctx: CanvasRenderingContext2D, alpha: number) {
    // 新图尚未烘完时仍贴上一张完整图；首次烘焙完成前才保持空白。
    const shown = this.shown;
    if (!shown || shown.terrain !== this.terrain || shown.season !== this.season || !(alpha > 0.004)) return false;
    const r = shown.rect;
    const a0 = ctx.globalAlpha;
    ctx.globalAlpha = a0 * Math.min(1, alpha);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(shown.cv, r.x, r.y, r.w, r.h);
    ctx.globalAlpha = a0;
    return true;
  }
}
