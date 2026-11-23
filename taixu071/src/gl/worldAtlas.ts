// P1 动态图集：2048×2048 RGBA Shelf Packing，手机 8 页 / 桌面 12 页，LRU 页淘汰 + 2px padding 防渗色
import { IS_TOUCH } from '../core/touch';

export const WORLD_ATLAS_SIZE = 2048;
export const WORLD_ATLAS_MAX_PAGES = IS_TOUCH ? 8 : 12;
export const WORLD_ATLAS_PAD = 4;

export interface WorldAtlasEntry {
  key: string;
  page: number;
  tex: WebGLTexture;
  px: number;
  py: number;
  w: number;
  h: number;
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  used: number;
  src: unknown;
}

interface AtlasPage {
  tex: WebGLTexture;
  shelfX: number;
  shelfY: number;
  rowH: number;
  lastUsed: number;
  keys: string[];
  dirty: boolean;
  mipReady: boolean;
}

export class WorldAtlas {
  frame = 0;
  uploadMB = 0;
  /** 本帧是否因超出单帧上传上限而限流（供渲染管线跳过回退 Canvas2D，避免整批退化卡顿） */
  throttled = false;
  /** 单帧新增大图上传上限（MB），防止缩放停稳或换页后单帧集中 texSubImage2D 造成卡顿 */
  maxNewUploadMB = 3.5;
  maxMipPages = 2;
  private pages: AtlasPage[] = [];
  private entries = new Map<string, WorldAtlasEntry>();
  private readonly mipSupported: boolean;

  constructor(private gl: WebGL2RenderingContext, readonly size = WORLD_ATLAS_SIZE, readonly maxPages = WORLD_ATLAS_MAX_PAGES) {
    const g = gl as unknown as Record<string, unknown>;
    this.mipSupported = typeof g.TEXTURE_MAX_LEVEL === 'number' && typeof g.LINEAR_MIPMAP_NEAREST === 'number' && typeof gl.generateMipmap === 'function';
  }

  beginFrame() {
    this.frame++;
    this.uploadMB = 0;
    this.throttled = false;
  }

  peek(key: string): WorldAtlasEntry | null {
    const existing = this.entries.get(key);
    if (!existing) return null;
    existing.used = this.frame;
    this.pages[existing.page].lastUsed = this.frame;
    return existing;
  }

  get pageCount() { return this.pages.length; }
  get entryCount() { return this.entries.size; }

  get(key: string): WorldAtlasEntry | null {
    const e = this.entries.get(key);
    if (!e) return null;
    e.used = this.frame;
    this.pages[e.page].lastUsed = this.frame;
    return e;
  }

  ensure(key: string, src: TexImageSource, w: number, h: number, dirty = false): WorldAtlasEntry | null {
    const pad = WORLD_ATLAS_PAD;
    if (!(w > 0 && h > 0) || w + pad * 2 > this.size || h + pad * 2 > this.size) return null;
    const hit = this.entries.get(key);
    if (hit) {
      hit.used = this.frame;
      this.pages[hit.page].lastUsed = this.frame;
      if (hit.src === src && !dirty) return hit;
      if (hit.w === w && hit.h === h) {
        this.uploadSub(hit.tex, hit.px, hit.py, w, h, src);
        this.pages[hit.page].dirty = true;
        hit.src = src;
        return hit;
      }
      // 尺寸变更（如低清回退升级为高清）：重新占槽，旧槽等该页 LRU 回收
      this.entries.delete(key);
    }

    this.throttled = false;
    const estMB = (w * h * 4) / 1048576;
    const limitMB = w * h <= 36000 ? this.maxNewUploadMB + 0.8 : this.maxNewUploadMB;
    if (this.uploadMB > 0 && w * h > 4096 && this.uploadMB + estMB > limitMB) {
      this.throttled = true;
      return null;
    }

    const bw = (w + pad * 2 + 3) & ~3, bh = (h + pad * 2 + 3) & ~3;
    let pIdx = -1;
    for (let i = 0; i < this.pages.length; i++) {
      if (this.canFit(this.pages[i], bw, bh)) { pIdx = i; break; }
    }
    if (pIdx < 0) {
      if (this.pages.length < this.maxPages) {
        pIdx = this.pages.length;
        this.pages.push(this.createPage());
      } else {
        pIdx = this.pickLruPage();
        if (pIdx < 0) return null; // 本帧全页均已占用：宁可走 2D 回退也不在同帧覆写已入批纹理
        this.resetPage(pIdx);
      }
    }

    const p = this.pages[pIdx];
    if (p.shelfX + bw > this.size) {
      p.shelfY += p.rowH;
      p.shelfX = 0;
      p.rowH = 0;
    }
    const px = p.shelfX + pad;
    const py = p.shelfY + pad;
    p.shelfX += bw;
    if (bh > p.rowH) p.rowH = bh;
    p.lastUsed = this.frame;
    p.keys.push(key);
    p.dirty = true;

    this.uploadSub(p.tex, px, py, w, h, src);
    const inv = 1 / this.size;
    const entry: WorldAtlasEntry = {
      key, page: pIdx, tex: p.tex,
      px, py, w, h,
      u0: px * inv, v0: py * inv, u1: (px + w) * inv, v1: (py + h) * inv,
      used: this.frame, src,
    };
    this.entries.set(key, entry);
    return entry;
  }

  private canFit(p: AtlasPage, bw: number, bh: number): boolean {
    if (p.shelfX + bw <= this.size && p.shelfY + bh <= this.size) return true;
    return p.shelfY + p.rowH + bh <= this.size;
  }

  private pickLruPage(): number {
    let best = -1, minUsed = Infinity;
    for (let i = 0; i < this.pages.length; i++) {
      if (this.pages[i].lastUsed >= this.frame) continue;
      if (this.pages[i].lastUsed < minUsed) { minUsed = this.pages[i].lastUsed; best = i; }
    }
    return best;
  }

  private resetPage(idx: number) {
    const p = this.pages[idx];
    for (const k of p.keys) {
      const e = this.entries.get(k);
      if (e && e.page === idx) this.entries.delete(k);
    }
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, p.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.size, this.size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    p.keys.length = 0;
    p.shelfX = 0;
    p.shelfY = 0;
    p.rowH = 0;
    p.lastUsed = this.frame;
    p.dirty = true;
    p.mipReady = false;
  }

  private createPage(): AtlasPage {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if (this.mipSupported) {
      // 借鉴 Factorio FFF #281：限制最大 3 级 mip（1x/0.5x/0.25x，2px pad 在 0.25x 下仍有 0.5 纹素安全边防渗色），
      // 使用 LINEAR_MIPMAP_NEAREST 兼顾远景抗锯齿闪烁与单层纹理带宽。
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, 2);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_NEAREST);
    } else {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.size, this.size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    return { tex, shelfX: 0, shelfY: 0, rowH: 0, lastUsed: this.frame, keys: [], dirty: true, mipReady: false };
  }

  /** 对本帧写入过的新增/更新图集页批量生成 0..2 级 Mipmap，供绘制前统一同步（新建/重置页必先补齐 mip 链防纯黑方块，已就绪页按 maxPages 限流） */
  flushMipmaps(maxPages = this.maxMipPages) {
    if (!this.mipSupported) return;
    const gl = this.gl;
    for (const p of this.pages) {
      if (p.mipReady) continue;
      gl.bindTexture(gl.TEXTURE_2D, p.tex);
      gl.generateMipmap(gl.TEXTURE_2D);
      p.mipReady = true;
      p.dirty = false;
    }
    if (maxPages <= 0) return;
    let flushed = 0;
    for (let pass = 0; pass < 2 && flushed < maxPages; pass++) {
      for (const p of this.pages) {
        if (!p.dirty) continue;
        if (pass === 0 && p.lastUsed !== this.frame) continue;
        gl.bindTexture(gl.TEXTURE_2D, p.tex);
        gl.generateMipmap(gl.TEXTURE_2D);
        p.dirty = false;
        if (++flushed >= maxPages) break;
      }
    }
  }

  private uploadSub(tex: WebGLTexture, x: number, y: number, _w: number, _h: number, src: TexImageSource) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    try {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, gl.RGBA, gl.UNSIGNED_BYTE, src);
      this.uploadMB += (_w * _h * 4) / 1048576;
    } finally {
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    }
  }

  dispose() {
    for (const p of this.pages) this.gl.deleteTexture(p.tex);
    this.pages.length = 0;
    this.entries.clear();
  }
}
