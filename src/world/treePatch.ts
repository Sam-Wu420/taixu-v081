// 树冠按片合图缓存（同源真树精灵烘焙）：
// - 彻底替代远景砍树（perChunkTreeCap 压到 1 棵）与地面绿滤镜铺底（FarPyramid 植被色块）；
// - 从近中景条带（L0：1024×256）到远景宏片（L1：2048×1024，L2：4096×2048）均使用同一批真实树坐标与精灵模板；
// - 烘焙时按真实 (x, y, s, flip, ax, ay) 精确对齐包围盒，切回单棵绘制时 0 像素位移、0 亮度跳变。
import { makeCanvas } from '../core/canvas';
import type { Spr } from '../gfx/sprites';
import type { Season } from '../gfx/tree';
import { CHUNK, type Terrain, type TreeDeco } from './terrain';
import { WORLD_W, WORLD_H } from '../data/world';

export const PATCH_TREE_K = 0.76;
export const PATCH_STRIP_N = 4;                  // L0 每 CHUNK(1024) 切 4 条 Y 带，高度 256
export const PATCH_STRIP_H = CHUNK / PATCH_STRIP_N;
export const PATCH_MACRO_STRIPS = 2;             // L1 / L2 每个宏格切 2 条 Y 带
export const PATCH_RES_L0 = 0.35;                // L0 条带片分辨率（px / 世界单位）
export const PATCH_RES_L1 = 0.14;                // L1 宏片分辨率（2×2 chunk，每带 2048×1024）
export const PATCH_RES_L2 = 0.07;                // L2 宏片分辨率（4×4 chunk，每带 4096×2048）
export const PATCH_MIN_TREES_L0 = 3;             // L0 少于 3 棵树的条带直接走单棵，省下显存槽位
export const PATCH_MAX_PIXELS = 32_000_000;      // 独立离屏片画布像素预算（~128MB）
const ATLAS_MAX_DIM = 2040;                      // WorldAtlas 单槽上限（2048 - 2*4）

export type PatchLevel = 0 | 1 | 2;

export interface TreePatch {
  key: string;
  level: PatchLevel;
  gx: number;
  gy: number;
  strip: number;
  empty: boolean;
  wx: number;
  wy: number;
  ww: number;
  wh: number;
  sortY: number;
  treeCount: number;
  spr: Spr | null;
  px: number;
  used: number;
}

export type PatchTemplateFn = (d: TreeDeco) => Spr | null;

export interface PatchBakeBudget {
  t0: number;
  budgetMs: number;
  bakes: number;
  scans: number;
  pending: boolean;
}

export function stripTreesFromChunk(trees: readonly TreeDeco[], cy: number): TreeDeco[][] {
  const strips: TreeDeco[][] = Array.from({ length: PATCH_STRIP_N }, () => []);
  const baseY = cy * CHUNK;
  for (let i = 0; i < trees.length; i++) {
    const d = trees[i];
    const idx = Math.max(0, Math.min(PATCH_STRIP_N - 1, Math.floor((d.y - baseY) / PATCH_STRIP_H)));
    strips[idx].push(d);
  }
  for (let s = 0; s < PATCH_STRIP_N; s++) {
    if (strips[s].length > 1) strips[s].sort((a, b) => a.y - b.y || a.x - b.x || a.v - b.v);
  }
  return strips;
}

export function patchKey(level: PatchLevel, decoRev: number, season: Season, gx: number, gy: number, strip: number): string {
  return `TP:${level}:${decoRev}:${season}:${gx}:${gy}:${strip}`;
}

function disposePatchCanvas(p: TreePatch) {
  if (!p.spr?.canvas) return;
  try {
    const c = p.spr.canvas as unknown as { close?: () => void; width: number; height: number };
    if (typeof c.close === 'function') c.close();
    else { c.width = 0; c.height = 0; }
  } catch { /* */ }
  p.spr = null;
}

export class TreePatchCache {
  private map = new Map<string, TreePatch>();
  private terrain: Terrain | null = null;
  private season: Season = 0;
  private decoRev = -1;
  private pixels = 0;
  frame = 0;
  bakes = 0;
  hits = 0;
  pending = false;

  constructor(readonly maxPixels = PATCH_MAX_PIXELS) {}

  get size() { return this.map.size; }
  get totalPixels() { return this.pixels; }

  clear() {
    for (const p of this.map.values()) disposePatchCanvas(p);
    this.map.clear();
    this.pixels = 0;
    this.pending = false;
  }

  syncState(T: Terrain, season: Season, decoRev: number) {
    if (this.terrain !== T || this.season !== season || this.decoRev !== decoRev) {
      this.clear();
      this.terrain = T;
      this.season = season;
      this.decoRev = decoRev;
    }
  }

  beginFrame(T: Terrain, season: Season, decoRev: number) {
    this.syncState(T, season, decoRev);
    this.frame++;
    this.pending = false;
  }

  peek(level: PatchLevel, decoRev: number, season: Season, gx: number, gy: number, strip: number): TreePatch | null {
    const k = patchKey(level, decoRev, season, gx, gy, strip);
    const hit = this.map.get(k);
    if (!hit) return null;
    hit.used = this.frame;
    this.map.delete(k);
    this.map.set(k, hit);
    this.hits++;
    return hit;
  }

  /** 将一组已排序的真实树木精确合成为一张世界坐标对齐的透明片 */
  private bakeFromTrees(
    key: string,
    level: PatchLevel,
    gx: number,
    gy: number,
    strip: number,
    trees: readonly TreeDeco[],
    pxPerWorld: number,
    getTemplate: PatchTemplateFn,
  ): TreePatch {
    if (!trees.length) {
      return { key, level, gx, gy, strip, empty: true, wx: 0, wy: 0, ww: 0, wh: 0, sortY: 0, treeCount: 0, spr: null, px: 0, used: this.frame };
    }
    const items: { d: TreeDeco; s: Spr }[] = [];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < trees.length; i++) {
      const d = trees[i];
      const s = getTemplate(d);
      if (!s) continue;
      const sc = d.s * PATCH_TREE_K;
      const x0 = d.x - (d.flip ? s.w - s.ax : s.ax) * sc;
      const y0 = d.y - s.ay * sc;
      const x1 = x0 + s.w * sc;
      const y1 = y0 + s.h * sc;
      if (x0 < minX) minX = x0;
      if (y0 < minY) minY = y0;
      if (x1 > maxX) maxX = x1;
      if (y1 > maxY) maxY = y1;
      items.push({ d, s });
    }
    if (!items.length || !(maxX > minX) || !(maxY > minY)) {
      return { key, level, gx, gy, strip, empty: true, wx: 0, wy: 0, ww: 0, wh: 0, sortY: 0, treeCount: 0, spr: null, px: 0, used: this.frame };
    }
    const padW = 2 / pxPerWorld;
    const bx0 = Math.floor((minX - padW) * pxPerWorld) / pxPerWorld;
    const by0 = Math.floor((minY - padW) * pxPerWorld) / pxPerWorld;
    const bx1 = Math.ceil((maxX + padW) * pxPerWorld) / pxPerWorld;
    const by1 = Math.ceil((maxY + padW) * pxPerWorld) / pxPerWorld;
    const spanW = bx1 - bx0;
    const spanH = by1 - by0;
    // 确保绝不超出 WorldAtlas 单槽上限
    const effScale = Math.min(pxPerWorld, ATLAS_MAX_DIM / Math.max(1, spanW), ATLAS_MAX_DIM / Math.max(1, spanH));
    const cw = Math.max(1, Math.min(ATLAS_MAX_DIM, Math.ceil(spanW * effScale)));
    const ch = Math.max(1, Math.min(ATLAS_MAX_DIM, Math.ceil(spanH * effScale)));
    const sx = cw / spanW;
    const sy = ch / spanH;

    const cv = makeCanvas(cw, ch);
    const g = cv.getContext('2d')!;
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'low';
    g.setTransform(sx, 0, 0, sy, -bx0 * sx, -by0 * sy);
    for (let i = 0; i < items.length; i++) {
      const { d, s } = items[i];
      const sc = d.s * PATCH_TREE_K;
      if (d.flip) {
        g.save();
        g.translate(d.x, d.y);
        g.scale(-sc, sc);
        g.drawImage(s.canvas, -s.ax, -s.ay, s.w, s.h);
        g.restore();
      } else {
        g.drawImage(s.canvas, d.x - s.ax * sc, d.y - s.ay * sc, s.w * sc, s.h * sc);
      }
    }
    const sortY = items[Math.floor(items.length * 0.72)].d.y;
    return {
      key, level, gx, gy, strip, empty: false,
      wx: bx0, wy: by0, ww: spanW, wh: spanH, sortY,
      treeCount: items.length,
      spr: { canvas: cv as HTMLCanvasElement, w: spanW, h: spanH, ax: 0, ay: 0 },
      px: cw * ch,
      used: this.frame,
    };
  }

  private put(p: TreePatch) {
    const old = this.map.get(p.key);
    if (old) {
      this.pixels -= old.px;
      disposePatchCanvas(old);
      this.map.delete(p.key);
    }
    this.map.set(p.key, p);
    this.pixels += p.px;
    this.evictIfNeeded();
  }

  private evictIfNeeded() {
    if (this.pixels <= this.maxPixels * 1.1) return;
    const target = this.maxPixels * 0.85;
    for (const [k, p] of this.map) {
      if (this.pixels <= target) break;
      if (p.used >= this.frame - 1) continue;
      this.map.delete(k);
      this.pixels -= p.px;
      disposePatchCanvas(p);
    }
  }

  /**
   * 取得或按预算烘焙 L0 条带片（1024 × 256）。
   * 若超出本帧预算返回 null（并设 pending=true），调用方无缝回退单棵绘制。
   */
  getL0Strip(
    decoRev: number,
    season: Season,
    cx: number,
    cy: number,
    strip: number,
    trees: readonly TreeDeco[],
    budget: PatchBakeBudget,
    getTemplate: PatchTemplateFn,
  ): TreePatch | null {
    if (trees.length < PATCH_MIN_TREES_L0) return null;
    const hit = this.peek(0, decoRev, season, cx, cy, strip);
    if (hit) return hit;
    if ((budget.bakes > 0 || budget.scans >= 16) && performance.now() - budget.t0 >= budget.budgetMs) {
      budget.pending = true;
      this.pending = true;
      return null;
    }
    budget.scans++;
    const key = patchKey(0, decoRev, season, cx, cy, strip);
    const p = this.bakeFromTrees(key, 0, cx, cy, strip, trees, PATCH_RES_L0, getTemplate);
    this.put(p);
    budget.bakes++;
    this.bakes++;
    return p;
  }

  /**
   * 取得或按预算烘焙远景宏片（level=1 覆盖 2×2 块、每带 2048×1024；level=2 覆盖 4×4 块、每带 4096×2048）。
   */
  getMacroStrip(
    T: Terrain,
    level: 1 | 2,
    decoRev: number,
    season: Season,
    gx: number,
    gy: number,
    strip: number,
    budget: PatchBakeBudget,
    getTemplate: PatchTemplateFn,
  ): TreePatch | null {
    const hit = this.peek(level, decoRev, season, gx, gy, strip);
    if (hit) return hit;
    if ((budget.bakes > 0 || budget.scans >= 16) && performance.now() - budget.t0 >= budget.budgetMs) {
      budget.pending = true;
      this.pending = true;
      return null;
    }
    budget.scans++;
    const chunksPerMacro = level === 1 ? 2 : 4;
    const stripSpanChunks = chunksPerMacro / PATCH_MACRO_STRIPS; // level=1 -> 1, level=2 -> 2
    const cx0 = gx * chunksPerMacro;
    const cy0 = gy * chunksPerMacro + strip * stripSpanChunks;
    const maxCx = Math.floor(WORLD_W / CHUNK);
    const maxCy = Math.floor(WORLD_H / CHUNK);
    const trees: TreeDeco[] = [];
    for (let cy = cy0; cy < cy0 + stripSpanChunks; cy++) {
      if (cy < 0 || cy > maxCy) continue;
      for (let cx = cx0; cx < cx0 + chunksPerMacro; cx++) {
        if (cx < 0 || cx > maxCx) continue;
        // v081 适配：getDecos 返回混合 Deco[]，需过滤出 tree 类型
        const decos = T.getDecos(cx, cy);
        for (let i = 0; i < decos.length; i++) {
          if (decos[i].kind === 'tree') trees.push(decos[i] as TreeDeco);
        }
      }
    }
    if (trees.length > 1) trees.sort((a, b) => a.y - b.y || a.x - b.x || a.v - b.v);
    const pxPerWorld = level === 1 ? PATCH_RES_L1 : PATCH_RES_L2;
    const key = patchKey(level, decoRev, season, gx, gy, strip);
    const p = this.bakeFromTrees(key, level, gx, gy, strip, trees, pxPerWorld, getTemplate);
    this.put(p);
    if (!p.empty) {
      budget.bakes++;
      this.bakes++;
    }
    return p;
  }

  /** 当 L1/L2 宏片尚未就绪时，从缓存中取已就绪的子级片（L1 或 L0）顶替，避免缩放切层闪空 */
  collectCachedFallbackPatches(
    level: 1 | 2,
    decoRev: number,
    season: Season,
    gx: number,
    gy: number,
    strip: number,
    out: TreePatch[],
  ): boolean {
    if (level === 2) {
      // L2 (4×4 chunks, 2 strips -> each strip covers 4×2 chunks = 2×1 L1 blocks × 2 strips each)
      let foundAny = false;
      const l1x0 = gx * 2;
      const l1y0 = gy * 2 + strip;
      for (let lx = l1x0; lx < l1x0 + 2; lx++) {
        for (let ls = 0; ls < PATCH_MACRO_STRIPS; ls++) {
          const p1 = this.peek(1, decoRev, season, lx, l1y0, ls);
          if (p1) {
            if (!p1.empty) out.push(p1);
            foundAny = true;
          } else {
            // 再向下找 L0 条带
            const cxBase = lx * 2;
            const cy = l1y0 * 2 + ls;
            let allL0 = true;
            for (let cx = cxBase; cx < cxBase + 2; cx++) {
              for (let s0 = 0; s0 < PATCH_STRIP_N; s0++) {
                const p0 = this.peek(0, decoRev, season, cx, cy, s0);
                if (p0) { if (!p0.empty) out.push(p0); }
                else allL0 = false;
              }
            }
            if (allL0) foundAny = true;
          }
        }
      }
      return foundAny;
    }
    // level === 1 (2×2 chunks, 2 strips -> each strip covers 2×1 chunks)
    const cx0 = gx * 2;
    const cy = gy * 2 + strip;
    let foundAny = false;
    for (let cx = cx0; cx < cx0 + 2; cx++) {
      for (let s0 = 0; s0 < PATCH_STRIP_N; s0++) {
        const p0 = this.peek(0, decoRev, season, cx, cy, s0);
        if (p0) {
          if (!p0.empty) out.push(p0);
          foundAny = true;
        }
      }
    }
    return foundAny;
  }
}
