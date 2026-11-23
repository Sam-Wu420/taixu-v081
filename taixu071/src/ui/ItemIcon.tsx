// 原版物品采用程序图标；法器沿用程序绘制造型，模组显式注册的图标优先，加载失败时自动回退至程序图标或字形。
import { memo, useEffect, useState, type CSSProperties, type SyntheticEvent } from 'react';
import { itemDef } from '../data/items';
import { ART_LOOK } from '../data/artlooks';
import { artIconURL } from '../gfx/artifact';
import { modItemIcon, proceduralItemIcon } from '../gfx/itemProcedural';

export function itemFallbackIconURL(id: string, px = 64): string | null {
  const d = itemDef(id);
  if (d.type === 'artifact' || ART_LOOK[id]) return artIconURL(id, d.art?.kind, d.art?.color, px, d.art?.look) ?? proceduralItemIcon(d);
  return proceduralItemIcon(d);
}

export function itemIconURL(id: string, px = 64): string | null {
  return modItemIcon(id) || itemFallbackIconURL(id, px);
}

// 将 SVG data URL 在后台分帧异步光栅化为 64×64 PNG（优先 blob URL 避免主线程同步 base64 编码），
// 防止储物袋/坊市首次打开时上百个图标在 onLoad 集中调用 toDataURL() 导致主线程卡顿。
const rasterCache = new Map<string, string>();
const MAX_RASTER_CACHE = 512;
let rasterCanvas: HTMLCanvasElement | null = null;
let rasterCtx: CanvasRenderingContext2D | null = null;

type RasterJob = { key: string; img: HTMLImageElement };
const rasterQueue: RasterJob[] = [];
const queuedKeys = new Set<string>();
let rasterRaf = 0;

function storeRasterUrl(key: string, url: string) {
  if (rasterCache.has(key)) {
    if (url.startsWith('blob:')) try { URL.revokeObjectURL(url); } catch { /* */ }
    return;
  }
  if (rasterCache.size >= MAX_RASTER_CACHE) {
    const first = rasterCache.keys().next().value;
    if (first !== undefined) {
      const old = rasterCache.get(first);
      rasterCache.delete(first);
      if (old && old.startsWith('blob:')) try { URL.revokeObjectURL(old); } catch { /* */ }
    }
  }
  rasterCache.set(key, url);
}

function pumpRasterQueue() {
  rasterRaf = 0;
  if (typeof document === 'undefined' || !rasterQueue.length) return;
  if (!rasterCanvas) {
    rasterCanvas = document.createElement('canvas');
    rasterCanvas.width = 64;
    rasterCanvas.height = 64;
    rasterCtx = rasterCanvas.getContext('2d');
  }
  if (!rasterCtx) {
    rasterQueue.length = 0;
    queuedKeys.clear();
    return;
  }
  // 每帧最多处理 3 个图标且总耗时不超过 3ms，避免阻塞 UI 动画与点击响应
  const start = typeof performance !== 'undefined' ? performance.now() : 0;
  let processed = 0;
  while (rasterQueue.length > 0 && processed < 3) {
    const job = rasterQueue.shift()!;
    queuedKeys.delete(job.key);
    if (rasterCache.has(job.key)) continue;
    const img = job.img;
    if (!img.complete || !img.naturalWidth) continue;
    try {
      rasterCtx.clearRect(0, 0, 64, 64);
      rasterCtx.drawImage(img, 0, 0, 64, 64);
      if (typeof rasterCanvas.toBlob === 'function' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
        const key = job.key;
        rasterCanvas.toBlob((blob) => {
          if (!blob) return;
          try { storeRasterUrl(key, URL.createObjectURL(blob)); } catch { /* */ }
        }, 'image/png');
      } else {
        const png = rasterCanvas.toDataURL('image/png');
        if (png && png.startsWith('data:image/png')) storeRasterUrl(job.key, png);
      }
      processed++;
    } catch { /* 安全降级：保留原图 */ }
    if (start && performance.now() - start > 3) break;
  }
  if (rasterQueue.length > 0 && typeof requestAnimationFrame === 'function') {
    rasterRaf = requestAnimationFrame(pumpRasterQueue);
  }
}

function enqueueSvgBitmap(key: string, img: HTMLImageElement) {
  if (rasterCache.has(key) || queuedKeys.has(key) || typeof document === 'undefined') return;
  if (rasterQueue.length >= 256) return;
  queuedKeys.add(key);
  rasterQueue.push({ key, img });
  if (!rasterRaf && typeof requestAnimationFrame === 'function') {
    rasterRaf = requestAnimationFrame(pumpRasterQueue);
  }
}

/** 有图标就用图，模组图标加载失败时回退至程序图标或字形 */
export const ItemGlyph = memo(function ItemGlyph({
  id, className, style, px = 64,
}: { id: string; className: string; style?: CSSProperties; px?: number; lazy?: boolean }) {
  const modUrl = modItemIcon(id);
  const d = itemDef(id);
  const [phase, setPhase] = useState<'primary' | 'fallback' | 'glyph'>('primary');
  useEffect(() => { setPhase('primary'); }, [id, px, modUrl]);

  const rawSrc = phase === 'primary'
    ? (modUrl || itemFallbackIconURL(id, px))
    : phase === 'fallback'
      ? (modUrl ? itemFallbackIconURL(id, px) : null)
      : null;

  if (rawSrc) {
    const isSvg = rawSrc.startsWith('data:image/svg+xml');
    const cacheKey = isSvg ? `${id}:${px}` : '';
    const src = (cacheKey && rasterCache.get(cacheKey)) || rawSrc;
    const onLoad = cacheKey && !rasterCache.has(cacheKey)
      ? (e: SyntheticEvent<HTMLImageElement>) => enqueueSvgBitmap(cacheKey, e.currentTarget)
      : undefined;
    return (
      <img
        className={className + ' art-ico'}
        src={src}
        alt={d.name}
        draggable={false}
        decoding="async"
        onLoad={onLoad}
        onError={() => setPhase((cur) => (cur === 'primary' && modUrl ? 'fallback' : 'glyph'))}
      />
    );
  }
  return <span className={className} style={style}>{d.glyph}</span>;
});
