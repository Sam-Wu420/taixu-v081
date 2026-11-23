// P3：远景符号层（城镇 / 宗门 / 灵脉 / 秘境 / 妖兽群图标 + 名牌，优先级配额 <= 200，AABB 碰撞防重叠）
import { makeCanvas } from '../core/canvas';
import type { LocDef } from '../data/world';

export const SYMBOL_MAX = 200;
const PLAQUE_CACHE_MAX = 256;

export type SymbolKind = 'sect' | 'city' | 'town' | 'port' | 'vein' | 'ruin' | 'landmark' | 'beast';

export interface WorldSymbol {
  id: string;
  kind: SymbolKind;
  label: string;
  wx: number;
  wy: number;
  priority: number;
  explored: boolean;
  hostile?: boolean;
}

export interface BakedSymbolPlaque {
  key: string;
  canvas: HTMLCanvasElement;
  w: number;
  h: number;
}

const KIND_COLOR: Record<SymbolKind, string> = {
  sect: '#f5d98c',
  city: '#ebd7b0',
  town: '#d7cab0',
  port: '#9cd2e6',
  vein: '#8ee6b8',
  ruin: '#d5a8ef',
  landmark: '#f4c07a',
  beast: '#ea8575',
};

let measureCtx: CanvasRenderingContext2D | null = null;
function measureText(text: string, font: string): number {
  if (!measureCtx) {
    const c = makeCanvas(8, 8);
    measureCtx = c.getContext('2d');
  }
  if (!measureCtx) return text.length * 12;
  measureCtx.font = font;
  return measureCtx.measureText(text).width;
}

function drawSymbolGlyph(g: CanvasRenderingContext2D, kind: SymbolKind, cx: number, cy: number, r: number, col: string) {
  g.save();
  g.strokeStyle = col;
  g.fillStyle = col;
  g.lineWidth = Math.max(1.2, r * 0.22);
  g.lineJoin = 'round';
  g.beginPath();
  if (kind === 'sect') {
    // 剑峰菱印
    g.moveTo(cx, cy - r);
    g.lineTo(cx + r * 0.72, cy + r * 0.25);
    g.lineTo(cx, cy + r * 0.9);
    g.lineTo(cx - r * 0.72, cy + r * 0.25);
    g.closePath();
    g.stroke();
    g.beginPath();
    g.moveTo(cx, cy - r * 0.55);
    g.lineTo(cx, cy + r * 0.55);
    g.stroke();
  } else if (kind === 'city') {
    // 方印城垣
    g.rect(cx - r * 0.75, cy - r * 0.75, r * 1.5, r * 1.5);
    g.stroke();
    g.fillRect(cx - r * 0.25, cy - r * 0.25, r * 0.5, r * 0.5);
  } else if (kind === 'vein') {
    // 灵脉双层灵晶符印
    g.moveTo(cx, cy - r);
    g.lineTo(cx + r * 0.78, cy);
    g.lineTo(cx, cy + r);
    g.lineTo(cx - r * 0.78, cy);
    g.closePath();
    g.stroke();
    g.beginPath();
    g.moveTo(cx, cy - r * 0.55);
    g.lineTo(cx + r * 0.42, cy);
    g.lineTo(cx, cy + r * 0.55);
    g.lineTo(cx - r * 0.42, cy);
    g.closePath();
    g.fill();
  } else if (kind === 'ruin') {
    // 古府菱标
    g.moveTo(cx, cy - r * 0.9);
    g.lineTo(cx + r * 0.85, cy);
    g.lineTo(cx, cy + r * 0.9);
    g.lineTo(cx - r * 0.85, cy);
    g.closePath();
    g.fill();
  } else if (kind === 'beast') {
    // 妖兽三角警标
    g.moveTo(cx, cy - r * 0.85);
    g.lineTo(cx + r * 0.8, cy + r * 0.7);
    g.lineTo(cx - r * 0.8, cy + r * 0.7);
    g.closePath();
    g.fill();
  } else {
    g.arc(cx, cy, r * 0.65, 0, Math.PI * 2);
    g.stroke();
  }
  g.restore();
}

export function locToSymbolKind(type: LocDef['type']): SymbolKind {
  if (type === 'sect') return 'sect';
  if (type === 'city') return 'city';
  if (type === 'isle') return 'port';
  if (type === 'danger' || type === 'secret') return 'ruin';
  return 'town';
}

export class SymbolLayer {
  private cache = new Map<string, BakedSymbolPlaque>();
  drawnCount = 0;

  clear() {
    this.cache.clear();
  }

  plaque(kind: SymbolKind, label: string, explored: boolean, dpr: number): BakedSymbolPlaque {
    const res = Math.min(2, Math.max(1, Math.round(dpr)));
    const key = `SYM:${kind}:${explored ? 1 : 0}:${res}:${label}`;
    const hit = this.cache.get(key);
    if (hit) {
      this.cache.delete(key);
      this.cache.set(key, hit);
      return hit;
    }
    const fontPx = 12;
    const font = `${fontPx}px "Noto Serif SC","Songti SC",serif`;
    const tw = measureText(label, font);
    const padX = 6;
    const iconW = 14;
    const wCss = Math.ceil(padX * 2 + iconW + 4 + tw);
    const hCss = 22;
    const cv = makeCanvas(wCss * res, hCss * res);
    const g = cv.getContext('2d')!;
    g.scale(res, res);
    g.fillStyle = explored ? 'rgba(24,20,16,0.78)' : 'rgba(24,20,16,0.58)';
    g.strokeStyle = explored ? 'rgba(218,194,132,0.55)' : 'rgba(180,168,140,0.35)';
    g.lineWidth = 1;
    g.beginPath();
    g.roundRect(0.5, 0.5, wCss - 1, hCss - 1, 4);
    g.fill();
    g.stroke();

    const col = KIND_COLOR[kind];
    drawSymbolGlyph(g, kind, padX + iconW * 0.45, hCss * 0.5, 5, col);
    g.font = font;
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillStyle = explored ? col : 'rgba(225,218,200,0.82)';
    g.fillText(label, padX + iconW + 3, hCss * 0.5 + 0.5);

    const baked: BakedSymbolPlaque = { key, canvas: cv, w: wCss, h: hCss };
    this.cache.set(key, baked);
    while (this.cache.size > PLAQUE_CACHE_MAX) {
      const oldest = this.cache.keys().next().value;
      if (!oldest) break;
      this.cache.delete(oldest);
    }
    return baked;
  }

  /** 过滤、排序（优先级升序）并做屏幕空间 AABB 防重叠，严格限额 <= 200 */
  layout(
    symbols: readonly WorldSymbol[],
    camX: number,
    camY: number,
    zoom: number,
    cssW: number,
    cssH: number,
    dpr: number,
    cap = SYMBOL_MAX,
    padPx = 3,
  ): Array<{ sym: WorldSymbol; sx: number; sy: number; plaque: BakedSymbolPlaque }> {
    const sorted = [...symbols].sort((a, b) => a.priority - b.priority || (a.explored === b.explored ? 0 : a.explored ? -1 : 1) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const placed: Array<{ x0: number; y0: number; x1: number; y1: number }> = [];
    const out: Array<{ sym: WorldSymbol; sx: number; sy: number; plaque: BakedSymbolPlaque }> = [];
    const limit = Math.max(0, Math.min(SYMBOL_MAX, cap));
    const pad = Math.max(0, padPx);

    for (const sym of sorted) {
      if (out.length >= limit) break;
      const sx = cssW * 0.5 + (sym.wx - camX) * zoom;
      const sy = cssH * 0.5 + (sym.wy - camY) * zoom;
      if (sx < -120 || sx > cssW + 120 || sy < -40 || sy > cssH + 40) continue;
      const pl = this.plaque(sym.kind, sym.label, sym.explored, dpr);
      const x0 = sx - pl.w * 0.5 - pad;
      const y0 = sy - pl.h * 0.5 - pad;
      const x1 = x0 + pl.w + pad * 2;
      const y1 = y0 + pl.h + pad * 2;
      let hit = false;
      for (let i = 0; i < placed.length; i++) {
        const b = placed[i];
        if (x0 < b.x1 && x1 > b.x0 && y0 < b.y1 && y1 > b.y0) { hit = true; break; }
      }
      if (hit) continue;
      placed.push({ x0, y0, x1, y1 });
      out.push({ sym, sx, sy, plaque: pl });
    }
    this.drawnCount = out.length;
    return out;
  }
}
