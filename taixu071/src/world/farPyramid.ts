// P3：远景金字塔缓存（L = clamp(round(log2(1/zoom)), 0, 5)，256² × LRU 64）
// 将极远景的「植被密度色块 + 山脉脊线 + 河道/官道」预烘成 256² 世界瓦片；
// 单帧烘焙预算 <= 2.0ms，未就绪瓦片由既有 CanopyLayer + FarGeometry 兜底，就绪后每帧仅提交 <= 9 个图块。
import { makeCanvas } from '../core/canvas';
import { coverColor, type Season, type Species } from '../gfx/tree';
import { smooth } from '../gfx/lod';
import type { Terrain } from './terrain';
import { WORLD_W, WORLD_H } from '../data/world';

export const PYRAMID_TILE_PX = 256;
export const PYRAMID_LRU_MAX = 64;
export const PYRAMID_BAKE_MS = 2.0;
/** 持久化全图根层级（L=7，每块 65536 世界单位；全图仅 ~6 块，永不被 64 块普通 LRU 淘汰） */
export const PYRAMID_MACRO_LEVEL = 7;

export interface PyramidTile {
  key: string;
  id: number;
  level: number;
  tx: number;
  ty: number;
  wx: number;
  wy: number;
  worldSize: number;
  canvas: HTMLCanvasElement;
}

export interface PyramidPoly { pts: readonly [number, number][] }

export interface PyramidFallback {
  tile: PyramidTile;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  wx: number;
  wy: number;
  worldSize: number;
}

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

function climateSpecies(cold: number, arid: number): Species | null {
  if (arid > 0.62) return null;
  if (cold > 0.55) return 'snowpine';
  if (cold > 0.38) return 'pine';
  if (arid > 0.42) return 'cypress';
  return 'broad';
}

export class FarPyramid {
  private tiles = new Map<string, PyramidTile>();
  private macroTiles = new Map<string, PyramidTile>();
  private terrain: Terrain | null = null;
  private season: Season = 0;
  private decoRev = -1;
  private nextId = 1;
  bakes = 0;
  hits = 0;

  static levelFor(zoom: number): number {
    if (!(zoom > 0) || !Number.isFinite(zoom)) return 5;
    return Math.max(0, Math.min(5, Math.round(Math.log2(1 / zoom))));
  }

  private vegCv: HTMLCanvasElement | null = null;
  private vegImg: ImageData | null = null;
  static worldSizeFor(level: number): number {
    // 256px 瓦片每级覆盖 2^(level+1) 倍采样步长（L=4 → 8192，L=5 → 16384，L=7 → 65536 世界单位）
    return PYRAMID_TILE_PX * Math.pow(2, level + 1);
  }

  get size() { return this.tiles.size; }
  get macroSize() { return this.macroTiles.size; }

  clear() {
    this.tiles.clear();
    this.macroTiles.clear();
  }

  private ensureMacroRoot(
    T: Terrain,
    season: Season,
    view: { left: number; top: number; right: number; bottom: number },
    ranges: readonly PyramidPoly[],
    rivers: readonly PyramidPoly[],
    roads: readonly PyramidPoly[],
    worldScale: number,
    t0: number,
    budgetMs: number,
    allowOneCold: boolean,
  ): PyramidTile[] {
    const mSize = FarPyramid.worldSizeFor(PYRAMID_MACRO_LEVEL);
    const mtx0 = Math.max(0, Math.floor(view.left / mSize));
    const mtx1 = Math.min(Math.floor(WORLD_W / mSize), Math.floor(view.right / mSize));
    const mty0 = Math.max(0, Math.floor(view.top / mSize));
    const mty1 = Math.min(Math.floor(WORLD_H / mSize), Math.floor(view.bottom / mSize));
    const cx = (view.left + view.right) * 0.5;
    const cy = (view.top + view.bottom) * 0.5;
    const out: PyramidTile[] = [];
    const missing: { tx: number; ty: number; d2: number }[] = [];
    for (let ty = mty0; ty <= mty1; ty++) {
      for (let tx = mtx0; tx <= mtx1; tx++) {
        const key = `${PYRAMID_MACRO_LEVEL}:${tx}:${ty}`;
        const hit = this.macroTiles.get(key);
        if (hit) {
          this.hits++;
          out.push(hit);
        } else {
          const mx = (tx + 0.5) * mSize - cx;
          const my = (ty + 0.5) * mSize - cy;
          missing.push({ tx, ty, d2: mx * mx + my * my });
        }
      }
    }
    if (missing.length) {
      missing.sort((a, b) => a.d2 - b.d2);
      for (const m of missing) {
        if ((out.length > 0 || !allowOneCold) && performance.now() - t0 >= budgetMs) break;
        const tile = this.bakeTile(T, season, PYRAMID_MACRO_LEVEL, m.tx, m.ty, mSize, ranges, rivers, roads, worldScale);
        this.macroTiles.set(tile.key, tile);
        out.push(tile);
        this.bakes++;
      }
    }
    return out;
  }

  /** 按当前视野渐进烘焙缺失瓦片（<= 2ms/帧），返回视野内已就绪瓦片、父级回退图块及是否完整覆盖 */
  prepare(
    T: Terrain,
    season: Season,
    view: { left: number; top: number; right: number; bottom: number },
    zoom: number,
    ranges: readonly PyramidPoly[],
    rivers: readonly PyramidPoly[],
    roads: readonly PyramidPoly[],
    worldScale: number,
    budgetMs = PYRAMID_BAKE_MS,
    includeMacro = false,
  ): { tiles: PyramidTile[]; fallbacks: PyramidFallback[]; complete: boolean; level: number } {
    if (this.terrain !== T || this.season !== season || this.decoRev !== (T.decoRevision ?? 0)) {
      this.tiles.clear();
      this.macroTiles.clear();
      this.terrain = T;
      this.season = season;
      this.decoRev = T.decoRevision ?? 0;
    }
    const level = FarPyramid.levelFor(zoom);
    const tileWorld = FarPyramid.worldSizeFor(level);
    const tx0 = Math.max(0, Math.floor(view.left / tileWorld));
    const tx1 = Math.min(Math.floor(WORLD_W / tileWorld), Math.floor(view.right / tileWorld));
    const ty0 = Math.max(0, Math.floor(view.top / tileWorld));
    const ty1 = Math.min(Math.floor(WORLD_H / tileWorld), Math.floor(view.bottom / tileWorld));
    const total = (tx1 >= tx0 && ty1 >= ty0) ? (tx1 - tx0 + 1) * (ty1 - ty0 + 1) : 0;
    // 视口所需瓦片超过 LRU 容量时：默认返回空以保护普通 LRU 不抖动；若启用全图持久化根层则切到 L=7 根瓦片兜底
    if (total > PYRAMID_LRU_MAX) {
      if (!includeMacro) return { tiles: [], fallbacks: [], complete: false, level };
      const t0 = performance.now();
      const macro = this.ensureMacroRoot(T, season, view, ranges, rivers, roads, worldScale, t0, budgetMs, true);
      const mSize = FarPyramid.worldSizeFor(PYRAMID_MACRO_LEVEL);
      const mtx0 = Math.max(0, Math.floor(view.left / mSize));
      const mtx1 = Math.min(Math.floor(WORLD_W / mSize), Math.floor(view.right / mSize));
      const mty0 = Math.max(0, Math.floor(view.top / mSize));
      const mty1 = Math.min(Math.floor(WORLD_H / mSize), Math.floor(view.bottom / mSize));
      const mTotal = (mtx1 >= mtx0 && mty1 >= mty0) ? (mtx1 - mtx0 + 1) * (mty1 - mty0 + 1) : 0;
      return { tiles: macro, fallbacks: [], complete: mTotal > 0 && macro.length === mTotal, level: PYRAMID_MACRO_LEVEL };
    }

    const out: PyramidTile[] = [];
    const fallbacks: PyramidFallback[] = [];
    const missing: { tx: number; ty: number; d2: number }[] = [];
    const cx = (view.left + view.right) * 0.5;
    const cy = (view.top + view.bottom) * 0.5;

    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const key = `${level}:${tx}:${ty}`;
        const hit = this.tiles.get(key);
        if (hit) {
          this.tiles.delete(key);
          this.tiles.set(key, hit);
          this.hits++;
          out.push(hit);
        } else {
          const mx = (tx + 0.5) * tileWorld - cx;
          const my = (ty + 0.5) * tileWorld - cy;
          missing.push({ tx, ty, d2: mx * mx + my * my });
        }
      }
    }

    if (missing.length) {
      missing.sort((a, b) => a.d2 - b.d2);
      const t0 = performance.now();
      // 若当前处于精细层级且尚缺最粗 L=5 根瓦片，先顺手补齐覆盖视野的 L=5 根底图，保证子块未就绪时立即有父块回退
      if (level < 5) {
        const rootW = FarPyramid.worldSizeFor(5);
        const rtx0 = Math.max(0, Math.floor(view.left / rootW));
        const rty0 = Math.max(0, Math.floor(view.top / rootW));
        const rtx1 = Math.min(Math.floor(WORLD_W / rootW), Math.floor(view.right / rootW));
        const rty1 = Math.min(Math.floor(WORLD_H / rootW), Math.floor(view.bottom / rootW));
        for (let rty = rty0; rty <= rty1; rty++) {
          for (let rtx = rtx0; rtx <= rtx1; rtx++) {
            const rkey = `5:${rtx}:${rty}`;
            if (this.tiles.has(rkey)) continue;
            if (this.tiles.size > 0 && performance.now() - t0 >= budgetMs) break;
            const rtile = this.bakeTile(T, season, 5, rtx, rty, rootW, ranges, rivers, roads, worldScale);
            this.tiles.set(rtile.key, rtile);
            this.bakes++;
            while (this.tiles.size > PYRAMID_LRU_MAX) {
              const oldest = this.tiles.keys().next().value;
              if (!oldest) break;
              this.tiles.delete(oldest);
            }
          }
        }
      }
      const stillMissing: { tx: number; ty: number; d2: number }[] = [];
      for (const m of missing) {
        if ((out.length > 0 || stillMissing.length > 0) && performance.now() - t0 >= budgetMs) {
          stillMissing.push(m);
          continue;
        }
        const tile = this.bakeTile(T, season, level, m.tx, m.ty, tileWorld, ranges, rivers, roads, worldScale);
        this.tiles.set(tile.key, tile);
        out.push(tile);
        this.bakes++;
        while (this.tiles.size > PYRAMID_LRU_MAX) {
          const oldest = this.tiles.keys().next().value;
          if (!oldest) break;
          this.tiles.delete(oldest);
        }
      }
      // 对仍未烘出的子块，逐格向上查找已缓存父瓦片裁剪回退，不再因缺一格而弃用整层
      if (includeMacro && stillMissing.length > 0 && performance.now() - t0 < budgetMs) {
        this.ensureMacroRoot(T, season, view, ranges, rivers, roads, worldScale, t0, budgetMs, false);
      }
      for (const m of stillMissing) {
        const wx = m.tx * tileWorld;
        const wy = m.ty * tileWorld;
        let resolved = false;
        for (let pLevel = level + 1; pLevel <= 5; pLevel++) {
          const pSize = FarPyramid.worldSizeFor(pLevel);
          const ptx = Math.floor(wx / pSize);
          const pty = Math.floor(wy / pSize);
          const pKey = `${pLevel}:${ptx}:${pty}`;
          const pTile = this.tiles.get(pKey);
          if (pTile) {
            this.tiles.delete(pKey);
            this.tiles.set(pKey, pTile);
            const scale = PYRAMID_TILE_PX / pSize;
            const sx = (wx - pTile.wx) * scale;
            const sy = (wy - pTile.wy) * scale;
            const sw = tileWorld * scale;
            const sh = tileWorld * scale;
            fallbacks.push({ tile: pTile, sx, sy, sw, sh, wx, wy, worldSize: tileWorld });
            resolved = true;
            break;
          }
        }
        if (!resolved && includeMacro) {
          const pSize = FarPyramid.worldSizeFor(PYRAMID_MACRO_LEVEL);
          const ptx = Math.floor(wx / pSize);
          const pty = Math.floor(wy / pSize);
          const pKey = `${PYRAMID_MACRO_LEVEL}:${ptx}:${pty}`;
          const pTile = this.macroTiles.get(pKey);
          if (pTile) {
            const scale = PYRAMID_TILE_PX / pSize;
            const sx = (wx - pTile.wx) * scale;
            const sy = (wy - pTile.wy) * scale;
            const sw = tileWorld * scale;
            const sh = tileWorld * scale;
            fallbacks.push({ tile: pTile, sx, sy, sw, sh, wx, wy, worldSize: tileWorld });
          }
        }
      }
    }

    return { tiles: out, fallbacks, complete: total > 0 && out.length === total, level };
  }

  private bakeTile(
    T: Terrain,
    season: Season,
    level: number,
    tx: number,
    ty: number,
    tileWorld: number,
    ranges: readonly PyramidPoly[],
    rivers: readonly PyramidPoly[],
    roads: readonly PyramidPoly[],
    worldScale: number,
  ): PyramidTile {
    const N = PYRAMID_TILE_PX;
    const cv = makeCanvas(N, N);
    const g = cv.getContext('2d')!;
    const wx0 = tx * tileWorld;
    const wy0 = ty * tileWorld;
    const step = tileWorld / N;

    // 1. 植被密度采样：写入 64² 缓冲并以双线性平滑放大到 256²，消除硬方块锯齿
    const GRID = 64;
    const cellW = tileWorld / GRID;
    const groves = typeof (T as Partial<Terrain>).grovesInRect === 'function'
      ? T.grovesInRect(wx0, wy0, wx0 + tileWorld, wy0 + tileWorld)
      : [];
    if (!this.vegCv) {
      this.vegCv = makeCanvas(GRID, GRID);
      this.vegImg = this.vegCv.getContext('2d')?.createImageData(GRID, GRID) ?? null;
    }
    const vc = this.vegCv.getContext('2d');
    const vimg = this.vegImg;
    if (vc && vimg) {
      const data = vimg.data;
      data.fill(0);
      for (let gy = 0; gy < GRID; gy++) {
        const wy = wy0 + (gy + 0.5) * cellW;
        if (wy < 0 || wy > WORLD_H) continue;
        for (let gx = 0; gx < GRID; gx++) {
          const wx = wx0 + (gx + 0.5) * cellW;
          if (wx < 0 || wx > WORLD_W) continue;
          if (typeof (T as Partial<Terrain>).isLand === 'function' && !T.isLand(wx, wy)) continue;
          let forest = 0;
          let sp: Species | null = null;
          for (const gv of groves) {
            const dx = (wx - gv.x) / Math.max(1, gv.r);
            const dy = (wy - gv.y) / Math.max(1, gv.r * 0.75);
            const d2 = dx * dx + dy * dy;
            if (d2 < 1) {
              const w = smooth(1 - Math.sqrt(d2), 0, 0.35);
              if (w > forest) { forest = w; sp = gv.sp; }
            }
          }
          if (!sp && typeof (T as Partial<Terrain>).sample === 'function') {
            const s = T.sample(wx, wy);
            if (s.forest > 0.28) {
              sp = climateSpecies(s.cold, s.arid);
              forest = smooth(s.forest, 0.28, 0.75) * 0.85;
            }
          }
          if (sp && forest > 0.04) {
            const [r, gr, b] = coverRgb(sp, season);
            const k = (gy * GRID + gx) * 4;
            data[k] = r; data[k + 1] = gr; data[k + 2] = b;
            data[k + 3] = Math.round(Math.min(0.68, forest * 0.78) * 255);
          }
        }
      }
      vc.putImageData(vimg, 0, 0);
      const prevSmooth = g.imageSmoothingEnabled;
      g.imageSmoothingEnabled = true;
      g.drawImage(this.vegCv, 0, 0, N, N);
      g.imageSmoothingEnabled = prevSmooth;
    }

    // 2. 极远河道 / 官道 / 山脉脊线烘入瓦片
    const wx1 = wx0 + tileWorld, wy1 = wy0 + tileWorld;
    const drawPolys = (polys: readonly PyramidPoly[], stroke: string, widthPx: number) => {
      g.strokeStyle = stroke;
      g.lineWidth = widthPx;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      for (const p of polys) {
        if (p.pts.length < 2) continue;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const [px, py] of p.pts) {
          const x = px * worldScale, y = py * worldScale;
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
        if (maxX < wx0 || minX > wx1 || maxY < wy0 || minY > wy1) continue;
        g.beginPath();
        const stride = Math.max(1, Math.floor(p.pts.length / 64));
        for (let i = 0; i < p.pts.length; i += stride) {
          const x = (p.pts[i][0] * worldScale - wx0) / step;
          const y = (p.pts[i][1] * worldScale - wy0) / step;
          if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
        }
        const last = p.pts[p.pts.length - 1];
        g.lineTo((last[0] * worldScale - wx0) / step, (last[1] * worldScale - wy0) / step);
        g.stroke();
      }
    };

    drawPolys(rivers, 'rgba(92,138,154,0.34)', 1.5);
    drawPolys(roads, 'rgba(156,126,88,0.28)', 1.0);
    drawPolys(ranges, 'rgba(72,64,54,0.38)', 1.4);

    return {
      key: `${level}:${tx}:${ty}`,
      id: this.nextId++,
      level,
      tx,
      ty,
      wx: wx0,
      wy: wy0,
      worldSize: tileWorld,
      canvas: cv,
    };
  }
}
