import { CanvasTexture, LinearFilter, Vector2, type WebGLRenderer } from 'three';
import { prof } from '../core/prof';
import { BitmapFrame } from '../gfx/bitmap-frame';

export type StaticImage = HTMLCanvasElement | BitmapFrame;

export interface StaticSprite {
  image: StaticImage; key?: object;
  l: number; r: number; t: number; b: number;
  flip?: boolean; alpha?: number; revision?: number;
}

export interface AtlasCell { u0: number; v0: number; u1: number; v1: number }
interface Page { x: number; y: number; px: number; py: number; rowH: number; generation: number; used: number }
interface Slot { cell: AtlasCell; page: Page; generation: number; x: number; y: number; width: number; height: number; used: number }
interface Entry extends Slot { image: StaticImage; revision: number }
interface Upload { image: StaticImage; x: number; y: number }

/** 直接写图集（不经中间纹理）；localStorage taixu.atlasdirect=0 可退回逐图拷贝 */
const DIRECT_UPLOAD = (() => { try { return typeof localStorage === 'undefined' || localStorage.getItem('taixu.atlasdirect') !== '0'; } catch { return true; } })();

/** 固定四页；按稳定键缓存画布或 Worker 位图帧。 */
export class HdStaticAtlas {
  readonly canvas: HTMLCanvasElement;
  readonly texture: CanvasTexture;
  readonly bytes: number;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly pages: Page[];
  private readonly entries = new Map<object, Entry>();
  private readonly free = new Map<string, Slot[]>();
  private readonly sources = new WeakMap<StaticImage, CanvasTexture<HTMLCanvasElement | ImageBitmap>>();
  private readonly position = new Vector2();
  private readonly uploads: Upload[] = [];
  /** 腾空重用的页：直接写图集时只把这一页清成透明，不再整张图集重画重传 */
  private readonly clearPages: Page[] = [];
  private zeros: Uint8Array | null = null;
  private fullUpload = true;
  private rawTouched = false;
  private frame = 0;

  constructor(private readonly pageSize = 2048) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = pageSize * 2;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.minFilter = LinearFilter; this.texture.generateMipmaps = false;
    this.bytes = this.canvas.width * this.canvas.height * 4;
    this.pages = [0, 1, 2, 3].map(i => ({ x: (i % 2) * pageSize, y: Math.floor(i / 2) * pageSize,
      px: 0, py: 0, rowH: 0, generation: 0, used: -Infinity }));
  }

  begin(): void {
    this.frame++;
    for (const [key, entry] of this.entries) {
      if (this.frame - entry.used > 120) { this.entries.delete(key); this.retire(entry); }
    }
  }

  get(image: StaticImage, revision = 0, key: object = image): AtlasCell | null {
    const hit = this.entries.get(key);
    if (hit && hit.generation === hit.page.generation && hit.width === image.width && hit.height === image.height) {
      hit.page.used = hit.used = this.frame;
      if (hit.revision !== revision || hit.image !== image) {
        if (hit.image !== image) {
          if (image instanceof BitmapFrame) image.retain();
          if (hit.image instanceof BitmapFrame) hit.image.release();
          if ((hit.image instanceof BitmapFrame) !== (image instanceof BitmapFrame))
            hit.cell = this.cell(hit.x, hit.y, hit.width, hit.height, image instanceof BitmapFrame);
          hit.image = image;
        }
        hit.revision = revision; this.uploads.push({ image, x: hit.x, y: hit.y });
      }
      return hit.cell;
    }
    if (hit) {
      this.entries.delete(key);
      if (hit.generation === hit.page.generation) this.retire(hit);
      else if (hit.image instanceof BitmapFrame) hit.image.release();
    }
    const w = image.width + 2, h = image.height + 2;
    if (w > this.pageSize || h > this.pageSize) { if (prof.on) prof.addMs('R·静态槽超页', 0, 1); return null; }
    const recycled = this.take(image.width, image.height);
    if (recycled) {
      const { x, y, page } = recycled, cell = this.cell(x, y, image.width, image.height, image instanceof BitmapFrame);
      page.used = this.frame;
      if (image instanceof BitmapFrame) image.retain();
      this.entries.set(key, { cell, page, generation: page.generation, x, y, width: image.width, height: image.height, image, revision, used: this.frame });
      this.uploads.push({ image, x, y });
      return cell;
    }
    let page = this.pages.find(p => this.fits(p, w, h));
    if (!page) {
      page = this.pages.filter(p => this.frame - p.used > 120).sort((a, b) => a.used - b.used)[0];
      if (!page) { if (prof.on) prof.addMs('R·静态槽已满', 0, 1); return null; }
      // P10：以前这里整张 4096² 图集重画、重传（64MB），城里树、人、摊子的图多，飞越时一页一页腾，每次卡上百毫秒。
      // 直接写图集时只清这一页（16MB 的透明块），别的页不动
      if (DIRECT_UPLOAD) { if (!this.clearPages.includes(page)) this.clearPages.push(page); } else this.fullUpload = true;
      page.px = page.py = page.rowH = 0; page.generation++;
      for (const [key, slots] of this.free) {
        const rest = slots.filter(slot => slot.page !== page);
        if (rest.length) this.free.set(key, rest); else this.free.delete(key);
      }
    }
    if (page.px + w > this.pageSize) { page.px = 0; page.py += page.rowH; page.rowH = 0; }
    const x = page.x + page.px + 1, y = page.y + page.py + 1;
    page.px += w; page.rowH = Math.max(page.rowH, h); page.used = this.frame;
    const cell = this.cell(x, y, image.width, image.height, image instanceof BitmapFrame);
    if (image instanceof BitmapFrame) image.retain();
    this.entries.set(key, { cell, page, generation: page.generation, x, y, width: image.width, height: image.height, image, revision, used: this.frame });
    this.uploads.push({ image, x, y });
    return cell;
  }

  flush(renderer: WebGLRenderer): void {
    if (!this.fullUpload && !this.uploads.length && !this.clearPages.length) return;
    const start = prof.on ? performance.now() : 0;
    if (this.clearPages.length && !this.fullUpload) {
      renderer.initTexture(this.texture);
      const handle = (renderer.properties?.get(this.texture) as { __webglTexture?: WebGLTexture } | undefined)?.__webglTexture;
      if (!handle) this.fullUpload = true;
      else {
        const gl = renderer.getContext() as WebGL2RenderingContext, P = this.pageSize;
        this.zeros ??= new Uint8Array(P * P * 4);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, handle); gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, null);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4); gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0); gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0); gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
        for (const page of this.clearPages) gl.texSubImage2D(gl.TEXTURE_2D, 0, page.x, this.canvas.height - page.y - P, P, P, gl.RGBA, gl.UNSIGNED_BYTE, this.zeros);
        this.rawTouched = true;
        if (prof.on) prof.addMs('R·静态纹理清页', 0, this.clearPages.length);
      }
    }
    this.clearPages.length = 0;
    if (this.fullUpload) {
      this.snapshot();
      this.texture.needsUpdate = true;
      renderer.initTexture(this.texture);
      for (const entry of this.entries.values()) if (entry.image instanceof BitmapFrame) this.upload(renderer, entry.image, entry.x, entry.y);
      if (prof.on) { prof.addMs('R·静态纹理整图上传', 0, 1); prof.num('N·上传字节', this.bytes); }
      this.fullUpload = false;
    } else {
      renderer.initTexture(this.texture);
      for (const upload of this.uploads) this.upload(renderer, upload.image, upload.x, upload.y);
      if (prof.on) prof.addMs('R·静态纹理分块上传', 0, this.uploads.length);
    }
    this.uploads.length = 0;
    // 直接动过 GL 状态（绑定、像素存储开关）：让 three 重新同步它记的状态
    if (this.rawTouched) { this.rawTouched = false; renderer.resetState(); }
    if (prof.on) prof.add('R·静态纹理提交', start);
  }

  invalidate(): void { this.fullUpload = true; }

  clearBitmaps(): void {
    for (const [key, entry] of this.entries) if (entry.image instanceof BitmapFrame) {
      this.entries.delete(key); this.retire(entry);
    }
    for (let i = this.uploads.length - 1; i >= 0; i--) if (this.uploads[i].image instanceof BitmapFrame) this.uploads.splice(i, 1);
  }

  snapshot(): HTMLCanvasElement {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    for (const entry of this.entries.values()) {
      const { image, x, y, height } = entry;
      if (image instanceof BitmapFrame) {
        this.ctx.save(); this.ctx.translate(x, y + height); this.ctx.scale(1, -1); this.ctx.drawImage(image.image, 0, 0); this.ctx.restore();
      } else this.ctx.drawImage(image, x, y);
    }
    return this.canvas;
  }

  dispose(): void {
    this.texture.dispose();
    for (const entry of this.entries.values()) if (entry.image instanceof BitmapFrame) entry.image.release();
    this.entries.clear(); this.free.clear(); this.uploads.length = 0;
  }

  private retire(entry: Entry): void {
    if (entry.image instanceof BitmapFrame) entry.image.release();
    const key = `${entry.width}x${entry.height}`;
    let slots = this.free.get(key);
    if (!slots) { slots = []; this.free.set(key, slots); }
    const { cell, page, generation, x, y, width, height, used } = entry;
    slots.push({ cell, page, generation, x, y, width, height, used });
  }

  private take(width: number, height: number): Slot | undefined {
    const key = `${width}x${height}`, slots = this.free.get(key);
    if (!slots) return;
    const index = slots.findIndex(slot => slot.used < this.frame);
    if (index < 0) return;
    const [slot] = slots.splice(index, 1);
    if (!slots.length) this.free.delete(key);
    return slot;
  }

  private fits(page: Page, w: number, h: number): boolean {
    return page.px + w <= this.pageSize ? page.py + h <= this.pageSize : page.py + page.rowH + h <= this.pageSize;
  }

  private cell(x: number, y: number, width: number, height: number, bitmap: boolean): AtlasCell {
    // ImageBitmap 上传不遵循 UNPACK_FLIP_Y_WEBGL，故其图集 v 坐标反向。
    const top = 1 - y / this.canvas.height, bottom = 1 - (y + height) / this.canvas.height;
    return { u0: x / this.canvas.width, v0: bitmap ? bottom : top, u1: (x + width) / this.canvas.width, v1: bitmap ? top : bottom };
  }

  /**
   * 把一张图直接写进图集纹理的对应格子（texSubImage2D）。
   * 以前是每张源图先建一张独立的 GPU 纹理、上传、再拷进图集，源纹理还一直留着不释放；
   * 现在一步到位，不产生中间纹理。翻转与预乘的约定和整图上传保持一致：
   * 画布按 flipY 上传（非预乘），ImageBitmap 不受这两个开关影响（所以它的 v 坐标在 cell() 里反过来）。
   */
  private upload(renderer: WebGLRenderer, image: StaticImage, x: number, y: number): void {
    if (prof.on) prof.num('N·上传字节', image.width * image.height * 4);
    const handle = (renderer.properties?.get(this.texture) as { __webglTexture?: WebGLTexture } | undefined)?.__webglTexture;
    if (!DIRECT_UPLOAD || !handle) {
      let source = this.sources.get(image);
      if (!source) { source = new CanvasTexture(image instanceof BitmapFrame ? image.image : image); this.sources.set(image, source); }
      this.position.set(x, this.canvas.height - y - image.height);
      renderer.copyTextureToTexture(source, this.texture, null, this.position);
      return;
    }
    const gl = renderer.getContext() as WebGL2RenderingContext;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, handle);
    gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, null);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0); gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0); gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, x, this.canvas.height - y - image.height, gl.RGBA, gl.UNSIGNED_BYTE,
      image instanceof BitmapFrame ? image.image : image);
    this.rawTouched = true;
  }
}
